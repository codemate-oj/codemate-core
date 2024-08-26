import { nanoid } from 'nanoid';
import { Context, Handler, InvalidTokenError, param, TokenModel, Types, UserModel, UserNotFoundError, ValidationError } from 'hydrooj';

class LostpassHandler extends Handler {
    @param('emailOrPhone', Types.String)
    async post(domainId: string, emailOrPhone: string) {
        await Promise.all([this.limitRate('send_mail', 3600, 30, false), this.limitRate(`user_lostpass_${emailOrPhone}`, 60, 3, false)]);
        const isEmail = emailOrPhone.includes('@');
        const udoc = isEmail ? await UserModel.getByEmail(domainId, emailOrPhone) : await UserModel.getByPhone(domainId, emailOrPhone);
        if (!udoc) throw new UserNotFoundError();
        const id = nanoid();
        const code = Math.floor(Math.random() * 1000000)
            .toString()
            .padStart(6, '0');
        if (isEmail) {
            const html = await this.renderHTML('user_lostpass_mail.html', {
                verifyCode: code,
            });
            await global.Hydro.lib.mail.sendMail(emailOrPhone, 'Codemate 找回密码', 'Codemate 找回密码', html);
        } else {
            await global.Hydro.lib.sms(`【CODEMATE】您的验证码是${code}，600s内有效`, emailOrPhone);
        }
        await TokenModel.add(
            TokenModel.TYPE_LOSTPASS,
            600,
            {
                emailOrPhone,
                verifyCode: code,
            },
            id,
        );
        this.response.body = {
            tokenId: id,
        };
    }
}

class LostpassWithCodeHandler extends Handler {
    @param('tokenId', Types.String)
    @param('verifyCode', Types.String)
    @param('emailOrPhone', Types.String)
    async post(domainId: string, tokenId: string, verifyCode: string, emailOrPhone: string) {
        const token = await TokenModel.get(tokenId, TokenModel.TYPE_LOSTPASS);
        if (!token) throw new InvalidTokenError();
        if (token.verifyCode !== verifyCode) throw new ValidationError('verifyCode');
        if (token.emailOrPhone !== emailOrPhone) throw new InvalidTokenError();
        const isEmail = emailOrPhone.includes('@');
        const udoc = isEmail ? await UserModel.getByEmail(domainId, emailOrPhone) : await UserModel.getByPhone(domainId, emailOrPhone);
        if (!udoc) throw new UserNotFoundError();
        await TokenModel.update(tokenId, TokenModel.TYPE_LOSTPASS, 600, {
            checkPassed: true,
            emailOrPhone,
        });
        this.response.body = {
            success: true,
            tokenId,
        };
    }
}

class LostpassResetHandler extends Handler {
    @param('tokenId', Types.String)
    @param('password', Types.String)
    async post(domainId: string, tokenId: string, password: string) {
        const token = await TokenModel.get(tokenId, TokenModel.TYPE_LOSTPASS);
        if (!token) throw new InvalidTokenError();
        if (!token.checkPassed) throw new InvalidTokenError();
        const isEmail = token.emailOrPhone.includes('@');
        const udoc = isEmail ? await UserModel.getByEmail(domainId, token.emailOrPhone) : await UserModel.getByPhone(domainId, token.emailOrPhone);
        await UserModel.setPassword(udoc._id, password);
        await TokenModel.del(tokenId, TokenModel.TYPE_LOSTPASS);
        this.response.body = {
            success: true,
        };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('lostpass', '/user/lostpass', LostpassHandler);
    ctx.Route('lostpass_with_code', '/user/lostpass/with_code', LostpassWithCodeHandler);
    ctx.Route('lostpass_reset', '/user/lostpass/reset', LostpassResetHandler);
}
