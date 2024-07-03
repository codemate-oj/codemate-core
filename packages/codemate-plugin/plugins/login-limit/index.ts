// 需求：一个账号只允许在一处登录，若多台设备登陆，则踢掉之前登录的设备

import { Context, Handler, PRIV, SettingModel, SystemModel, TokenModel, UserModel } from 'hydrooj';

export async function apply(ctx: Context) {
    ctx.inject(['setting'], async (c) => {
        c.setting.SystemSetting(
            SettingModel.Setting('setting_basic', 'loginlimit.whitelist', '127.0.0.1,::1,::ffff:127.0.0.1', 'text', 'loginLimit.whitelist'),
        );
    });
    const callback = async (that: Handler & Record<string, any>) => {
        if (that.session.uid <= 1) return; // user login failed
        const udoc = await UserModel.getById(that.args['domainId'], that.session.uid);
        const userIp = that.request.ip;
        const ipWhiteList = (SystemModel.get('loginlimit.whitelist') as string).split(',');
        if (ipWhiteList.includes(userIp)) return;
        if (udoc.hasPriv(PRIV.PRIV_UNLIMITED_ACCESS)) return;
        const tdocs = await TokenModel.getMulti(TokenModel.TYPE_SESSION, { uid: udoc._id }).toArray();
        await Promise.all(tdocs.map(async (tdoc) => TokenModel.del(tdoc._id, TokenModel.TYPE_SESSION)));
    };
    ctx.on('handler/after/TOTPLogin', callback);
    ctx.on('handler/after/UserLogin', callback);
}
