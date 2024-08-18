import { nanoid } from 'nanoid';
import {
    BlacklistedError,
    BlackListModel,
    Context,
    Handler,
    InvalidTokenError,
    param,
    PERM,
    PRIV,
    SettingModel,
    superagent,
    SystemModel,
    TokenDoc,
    TokenModel,
    Types,
    UserAlreadyExistError,
    UserModel,
    UserNotFoundError,
    ValidationError,
} from 'hydrooj';
import { logger, SendSMSFailedError } from './lib';
import { InvitatonModel } from '../invite-code/model';

declare module 'hydrooj' {
    interface Lib {
        sms: (msg: string, targetPhoneNumber: string) => Promise<boolean>;
    }
}

export class SendTokenBaseHandler extends Handler {
    generateCode = (length = 6) =>
        Math.floor(Math.random() * 1000000)
            .toString()
            .padStart(length, '0');

    generateToken = async (data = {}, code?: string) => {
        const id = nanoid();
        const _code = code ?? this.generateCode();
        await TokenModel.add(TokenModel.TYPE_REGISTRATION, 600, { ...data, verifyCode: _code }, id);
        return id;
    };

    @param('randStr', Types.String)
    @param('ticket', Types.String)
    async _prepare(_, randStr: string, ticket: string) {
        if (!(await global.Hydro.lib.verifyCaptchaToken(this.request.ip, randStr, ticket))) throw new ValidationError('captcha');
    }
}

export class SendSMSCodeHandler extends SendTokenBaseHandler {
    @param('phoneNumber', Types.String)
    async post(domainId: string, phoneNumber: string) {
        if (await UserModel.getByPhone(domainId, phoneNumber)) throw new UserAlreadyExistError(phoneNumber);

        const _code = this.generateCode();
        const sendResult = await global.Hydro.lib.sms(`【CODEMATE】您的验证码是${_code}，600s内有效`, phoneNumber);
        if (!sendResult) throw new SendSMSFailedError();

        await Promise.all([this.limitRate(`send_message_code_${phoneNumber}`, 60, 1, false)]);

        const id = await this.generateToken({ phoneNumber }, _code);

        this.response.body = {
            success: true,
            tokenId: id,
            code: 0,
        };
    }
}

export class SendEmailCodeHandler extends SendTokenBaseHandler {
    @param('mail', Types.String)
    async post(_, mail: string) {
        if (await UserModel.getByEmail('system', mail)) throw new UserAlreadyExistError(mail);

        // 黑名单逻辑
        const mailDomain = mail.split('@')[1];
        if (await BlackListModel.get(`mail::${mailDomain}`)) throw new BlacklistedError(mailDomain);

        await Promise.all([this.limitRate(`send_mail_${mail}`, 60, 3, false)]);

        const _code = this.generateCode();

        const html = await this.renderHTML('user_register_mail.html', {
            verifyCode: _code,
        });
        await global.Hydro.lib.mail.sendMail(mail, 'Codemate 注册验证码', 'Codemate 注册验证码', html);

        const id = await this.generateToken({ mail }, _code);

        this.response.body = {
            success: true,
            tokenId: id,
            code: 0,
        };
    }
}

export class RegisterBaseHandler extends Handler {
    token: TokenDoc;
    email: string;

    @param('tokenId', Types.String)
    @param('verifyCode', Types.String)
    async prepare(_, tokenId: string, verifyCode: string) {
        const token = await TokenModel.get(tokenId, TokenModel.TYPE_REGISTRATION);
        if (!token) throw new InvalidTokenError(TokenModel.TYPE_TEXTS[TokenModel.TYPE_REGISTRATION], tokenId);
        if (token.verifyCode !== verifyCode) throw new ValidationError('verifyCode');
        this.token = token;
        this.email = this.token.phoneNumber ? `mob-${this.token.phoneNumber}@hydro.local` : this.token.mail;
    }

    @param('uname', Types.Username)
    @param('password', Types.Password)
    @param('nickname', Types.String, true)
    @param('nationality', Types.String, true) // 国籍地区代码
    @param('regionCode', Types.String, true) // 国内行政区划代码（国外用000000代替）
    @param('userRole', Types.Int, true) // 用户角色（如机构老师、学生等）
    @param('age', Types.PositiveInt, true) // 年龄
    @param('inviteCode', Types.String, true) // 机构邀请码
    async post(
        domainId: string,
        uname: string,
        password: string,
        nickname?: string,
        nationality?: string,
        regionCode?: string,
        userRole?: number,
        age?: number,
        inviteCode?: string,
    ) {
        const uid = await UserModel.create(this.email, uname, password, undefined, this.request.ip);
        await UserModel.setById(uid, {
            nationality,
            regionCode,
            userRole,
            age,
            nickname,
            ...(this.token.phoneNumber ? { phoneNumber: this.token.phoneNumber } : {}),
        });
        await TokenModel.del(this.token._id, TokenModel.TYPE_REGISTRATION);

        // 邀请码注册
        if (inviteCode) {
            // 邀请码不应阻塞注册
            try {
                await InvitatonModel.registerCode(domainId, inviteCode, uid);
            } catch (e) {
                console.error(e);
                logger.error('inviteCode register fail: ', e.message);
            }
        }

        this.response.body = {
            success: true,
            code: 0,
            uid,
        };
        this.session.uid = uid;
        this.session.sudoUid = null;
        this.session.scope = PERM.PERM_ALL.toString();
        this.session.recreate = true;
    }
}

export class SendTOTPCodeHandler extends SendTokenBaseHandler {
    generateToken = async (data = {}, code?: string) => {
        const id = nanoid();
        const _code = code ?? this.generateCode();
        await TokenModel.add(TokenModel.TYPE_SMSLOGIN, 600, { ...data, verifyCode: _code }, id);
        return id;
    };

    @param('uname', Types.String)
    async post(domainId: string, uname: string) {
        const user = (await UserModel.getByUname(domainId, uname)) ?? (await UserModel.getByPhone(domainId, uname));
        if (!user) throw new UserNotFoundError(uname);

        const phoneNumber = user.phoneNumber ?? user.phone ?? user.mail.split('@')[0].replace(/^mob-/, '') ?? '';
        if (!phoneNumber) throw new ValidationError('phoneNumber');

        const _code = this.generateCode();
        const sendResult = await global.Hydro.lib.sms(`【CODEMATE】您的验证码是${_code}，600s内有效`, phoneNumber);
        if (!sendResult) throw new SendSMSFailedError();

        await Promise.all([this.limitRate(`send_message_code_${phoneNumber}`, 60, 1, false)]);

        const id = await this.generateToken({ phoneNumber, uid: user._id }, _code);

        this.response.body = {
            success: true,
            tokenId: id,
            code: 0,
        };
    }
}

export class TOTPLoginHandler extends Handler {
    @param('tokenId', Types.String)
    @param('verifyCode', Types.String)
    @param('rememberme', Types.Boolean)
    @param('redirect', Types.String, true)
    async post(domainId: string, tokenId: string, verifyCode: string, rememberme: boolean, redirect?: string) {
        const token = await TokenModel.get(tokenId, TokenModel.TYPE_SMSLOGIN);
        if (!token) throw new InvalidTokenError(TokenModel.TYPE_TEXTS[TokenModel.TYPE_SMSLOGIN], tokenId);
        if (token.verifyCode !== verifyCode) throw new ValidationError('verifyCode');

        const udoc = await UserModel.getById(domainId, token.uid);
        await UserModel.setById(udoc._id, { loginat: new Date(), loginip: this.request.ip });
        if (!udoc.hasPriv(PRIV.PRIV_USER_PROFILE)) throw new BlacklistedError(udoc.uname, udoc.banReason);

        this.session.viewLang = '';
        this.session.uid = udoc._id;
        this.session.sudo = null;
        this.session.scope = PERM.PERM_ALL.toString();
        this.session.save = rememberme;
        this.session.recreate = true;
        this.response.redirect = redirect || ((this.request.referer || '/login').endsWith('/login') ? this.url('homepage') : this.request.referer);

        await TokenModel.del(tokenId, TokenModel.TYPE_SMSLOGIN);
    }
}

export function apply(ctx: Context) {
    ctx.inject(['setting'], (c) => {
        c.setting.SystemSetting(
            SettingModel.Setting('setting_secrets', 'sms.username', '', 'text', 'SMS Username'),
            SettingModel.Setting('setting_secrets', 'sms.password', '', 'text', 'SMS Password'),
        );
    });
    ctx.Route('register_request_sms_code', '/register/sms-code', SendSMSCodeHandler, PRIV.PRIV_REGISTER_USER);
    ctx.Route('register_request_email_code', '/register/email-code', SendEmailCodeHandler, PRIV.PRIV_REGISTER_USER);
    ctx.Route('register_with_code', '/register/:tokenId', RegisterBaseHandler, PRIV.PRIV_REGISTER_USER);
    ctx.Route('login_with_sms_code', '/login/sms-code', SendTOTPCodeHandler);
    ctx.Route('request_login_sms_code', '/login/:tokenId', TOTPLoginHandler);
    global.Hydro.lib.sms = async (msg: string, targetPhoneNumber: string) => {
        const username: string = SystemModel.get('sms.username');
        const password: string = SystemModel.get('sms.password');
        const response = await superagent
            .get('https://api.smsbao.com/sms')
            .query({
                u: username,
                p: password,
                m: targetPhoneNumber,
                c: msg,
            })
            .send();
        if (response.text !== '0') logger.error(`Failed to send sms, response=${response.text}.`);
        return response.text === '0';
    };
}
