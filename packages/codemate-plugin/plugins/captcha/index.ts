import * as TencentCloudSDK from 'tencentcloud-sdk-nodejs-captcha';
import { Context, Handler, param, SettingModel, SystemModel, Types } from 'hydrooj';

declare module 'hydrooj' {
    interface Lib {
        verifyCaptchaToken(appId: number, appSecret: string, userIp: string, randStr: string, type: number, ticket: string): Promise<boolean>;
    }
}

export class CaptchaTestHandler extends Handler {
    @param('ticket', Types.String)
    @param('randStr', Types.String)
    async get(domainId: string, ticket: string, randStr: string) {
        const appId: string = SystemModel.get('captcha.testCaptchaAppId');
        const appSecret: string = SystemModel.get('captcha.testCaptchaAppSecretKey');
        const type = 9;
        const res = await global.Hydro.lib.verifyCaptchaToken(Number(appId), appSecret, this.request.ip, randStr, type, ticket);
        this.response.body = {
            success: res,
        };
    }
}

export function apply(ctx: Context) {
    ctx.inject(['setting'], (c) => {
        c.setting.SystemSetting(
            SettingModel.Setting('setting_secrets', 'captcha.captchaSecretId', '', 'text', 'Captcha SecretId'),
            SettingModel.Setting('setting_secrets', 'captcha.captchaSecretKey', '', 'text', 'Captcha SecretKey'),
            SettingModel.Setting('setting_secrets', 'captcha.testCaptchaAppId', '', 'text', 'Captcha Test AppId'), // For test purpose
            SettingModel.Setting('setting_secrets', 'captcha.testCaptchaAppSecretKey', '', 'text', 'Captcha Test AppSecretKey'), // For test purpose
        );
    });
    global.Hydro.lib.verifyCaptchaToken = async (appId: number, appSecret: string, userIp: string, randStr: string, type: number, ticket: string) => {
        const captchaClient = new TencentCloudSDK.captcha.v20190722.Client({
            credential: {
                secretId: SystemModel.get('captcha.captchaSecretId'),
                secretKey: SystemModel.get('captcha.captchaSecretKey'),
            },
        });
        const res = await captchaClient.DescribeCaptchaResult({
            CaptchaAppId: appId,
            UserIp: userIp,
            CaptchaType: type,
            Randstr: randStr,
            Ticket: ticket,
            NeedGetCaptchaTime: 1,
            AppSecretKey: appSecret,
        });
        return res.CaptchaCode === 1;
    };
    if (process.env.DEV) ctx.Route('captcha_test', '/captcha/test', CaptchaTestHandler);
}
