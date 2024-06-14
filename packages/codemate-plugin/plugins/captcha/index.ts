import * as TencentCloudSDK from 'tencentcloud-sdk-nodejs-captcha';
import { Context, SettingModel, SystemModel } from 'hydrooj';

declare module 'hydrooj' {
    interface Lib {
        verifyCaptchaToken(userIp: string, randStr: string, ticket: string): Promise<boolean>;
    }
}

export function apply(ctx: Context) {
    ctx.inject(['setting'], (c) => {
        c.setting.SystemSetting(
            SettingModel.Setting('setting_secrets', 'captcha.captchaSecretId', '', 'text', 'Captcha SecretId', '腾讯云Captcha Secrect ID'),
            SettingModel.Setting('setting_secrets', 'captcha.captchaSecretKey', '', 'text', 'Captcha SecretKey', '腾讯云Captcha Secrect Key'),
            SettingModel.Setting('setting_secrets', 'captcha.CaptchaAppId', '', 'text', 'Captcha AppId', 'Captcha前端应用的AppID'),
            SettingModel.Setting(
                'setting_secrets',
                'captcha.CaptchaAppSecretKey',
                '',
                'text',
                'Captcha AppSecretKey',
                'Captcha前端应用的AppSecretKey',
            ),
        );
    });
    global.Hydro.lib.verifyCaptchaToken = async (userIp: string, randStr: string, ticket: string) => {
        const secretId = SystemModel.get('captcha.captchaSecretId');
        console.log(secretId);
        const secretKey = SystemModel.get('captcha.captchaSecretKey');
        const appId = SystemModel.get('captcha.CaptchaAppId');
        const appSecretKey = SystemModel.get('captcha.CaptchaAppSecretKey');

        if (!secretId || !secretKey || !appId || !appSecretKey) {
            throw new Error('Captcha service is not configured');
        }

        const captchaClient = new TencentCloudSDK.captcha.v20190722.Client({
            credential: {
                secretId,
                secretKey,
            },
        });
        const res = await captchaClient.DescribeCaptchaResult({
            CaptchaAppId: Number(appId),
            AppSecretKey: appSecretKey,
            UserIp: userIp,
            CaptchaType: 9, // 固定值 9
            Randstr: randStr,
            Ticket: ticket,
            NeedGetCaptchaTime: 1,
        });
        return res.CaptchaCode === 1;
    };
}
