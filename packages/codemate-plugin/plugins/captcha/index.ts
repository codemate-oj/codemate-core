import * as TencentCloudSDK from 'tencentcloud-sdk-nodejs-captcha';
import { Context, SettingModel, SystemModel } from 'hydrooj';

declare module 'hydrooj' {
    interface Lib {
        verifyCaptchaToken(appId: number, appSecret: string, userIp: string, randStr: string, type: number, ticket: string): Promise<boolean>;
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
}
