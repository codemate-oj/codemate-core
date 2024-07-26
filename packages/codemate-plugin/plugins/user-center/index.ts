import { Context, Handler, param, post, PRIV, TokenModel, Types, Udoc, UserModel, UserNotFoundError } from 'hydrooj';

class UserCenterHandler extends Handler {
    @param('tabId', Types.Int, true)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async get(domainId: string, _tabId: number = 1) {
        const uid = this.user._id;
        if (uid === 0) throw new UserNotFoundError(0);
        const [udoc, sdoc] = await Promise.all([
            UserModel.getById(domainId, uid),
            TokenModel.getMostRecentSessionByUid(uid, ['createAt', 'updateAt']),
        ]);
        if (!udoc) throw new UserNotFoundError(uid);
        this.response.body = {
            udoc,
            sdoc,
        };
    }

    @post('nickname', Types.String, true)
    @post('nationality', Types.String, true)
    @post('age', Types.Int, true)
    @post('oier', Types.Boolean, true)
    async post(domainId: string, nickname: string = '', nationality: string = '中国', age: number = 0, oier: boolean = false) {
        const uid = this.user._id;
        if (uid === 0) throw new UserNotFoundError(0);
        const $update: Partial<Udoc> = {
            nationality,
            age,
            oier,
            nickname,
        };
        await UserModel.setById(uid, $update);
        this.response.body = { success: true };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('user_center', '/user/center', UserCenterHandler, PRIV.PRIV_USER_PROFILE);
}
