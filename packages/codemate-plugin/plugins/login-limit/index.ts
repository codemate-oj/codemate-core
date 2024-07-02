// 需求：一个账号只允许在一处登录，若多台设备登陆，则踢掉之前登录的设备

import { Context, Handler, PRIV, TokenModel, UserModel } from 'hydrooj';

declare module '../kv-service' {
    interface KVTypes {
        ipWhiteList: string[];
    }
}

export async function apply(ctx: Context) {
    const callback = async (that: Handler & Record<string, any>) => {
        if (that.session.uid <= 1) return; // user login failed
        const udoc = await UserModel.getById(that.args['domainId'], that.session.uid);
        const userIp = that.request.ip;
        const ipWhiteList = await ctx.kv.get('ipWhiteList');
        if (ipWhiteList.includes(userIp)) return;
        if (udoc.hasPriv(PRIV.PRIV_UNLIMITED_ACCESS)) return;
        const tdocs = await TokenModel.getMulti(TokenModel.TYPE_SESSION, { uid: udoc._id }).toArray();
        await Promise.all(tdocs.map(async (tdoc) => TokenModel.del(tdoc._id, TokenModel.TYPE_SESSION)));
    };
    ctx.on('handler/after/TOTPLogin', callback);
    ctx.on('handler/after/UserLogin', callback);

    // add local ips to whitelist
    await (async () => {
        const ipWhiteList = (await ctx.kv.get('ipWhiteList')) || [];
        if (ipWhiteList.length === 0) {
            await ctx.kv.set('ipWhiteList', ['127.0.0.1', '::1', '::ffff:127.0.0.1']);
        }
    })();
}
