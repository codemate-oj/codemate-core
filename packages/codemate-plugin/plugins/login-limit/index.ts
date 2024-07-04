// 需求：一个账号只允许在一处登录，若多台设备登陆，则踢掉之前登录的设备

import { Context, Handler, Logger, PRIV, SettingModel, SystemModel, TokenModel, UserModel } from 'hydrooj';

const logger = new Logger('ip-limit');

export function apply(ctx: Context) {
    ctx.inject(['setting'], async (c) => {
        c.setting.SystemSetting(
            SettingModel.Setting('setting_basic', 'loginlimit.whitelist', '127.0.0.1,::1,::ffff:127.0.0.1', 'text', 'loginLimit.whitelist'),
        );
    });
    const loginLimit = async (that: Handler & Record<string, any>) => {
        if (that.session.uid <= 1) return; // user login failed
        const udoc = await UserModel.getById(that.args['domainId'], that.session.uid);
        if (udoc.hasPriv(PRIV.PRIV_UNLIMITED_ACCESS)) return; // bypass admin
        const userIp = that.request.ip;
        // 处理IP白名单逻辑，以适应SSR
        const whiteListSetting: string = SystemModel.get('loginlimit.whitelist') ?? '';
        const ipWhiteList = whiteListSetting.split(',');
        if (ipWhiteList.includes(userIp)) return; // bypass server
        // 踢掉所有其他IP
        const tdocs = await TokenModel.getMulti(TokenModel.TYPE_SESSION, { uid: udoc._id }).toArray();
        await Promise.all(tdocs.map(async (tdoc) => TokenModel.del(tdoc._id, TokenModel.TYPE_SESSION)));
        if (tdocs.length > 0) {
            logger.info(`User ${udoc._id} login at ${userIp}. ${tdocs.length} sessions expired.`);
        }
    };
    ctx.on('handler/after/TOTPLogin', loginLimit);
    ctx.on('handler/after/UserLogin', loginLimit);
}
