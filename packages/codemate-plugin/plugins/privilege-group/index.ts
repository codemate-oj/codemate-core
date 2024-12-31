import { pick } from 'lodash';
import { Context, ForbiddenError, Handler, ObjectID, OplogModel, param, PERM, PRIV, TokenModel, Types } from 'hydrooj';
import {
    ActivationCodeExpiredError,
    ActivationCodeNotFoundError,
    ActivationCodeUsedError,
    DuplicatedActivationError,
    GroupNotFoundError,
    logger,
} from './lib';
import { GroupModel } from './model';

export class GroupOperationHandler extends Handler {
    @param('group', Types.String)
    @param('uid', Types.PositiveInt, true)
    async postCheck(domainId: string, name: string, uid = this.user._id) {
        if (this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM) || this.user.hasPerm(PERM.PERM_EDIT_DOMAIN)) {
            // 如果用户是域/全站管理员 则直接判断有权限
            this.response.body = {
                hasPermission: true,
            };
        } else {
            const result = await GroupModel.has(domainId, uid, name);
            this.response.body = {
                hasPermission: result,
            };
        }
    }

    @param('code', Types.Content)
    @param('uid', Types.PositiveInt, true)
    async postActivate(domainId: string, code: string, uid = this.user._id) {
        if (uid === 0) {
            throw new ForbiddenError('Not Logged In');
        }

        // 找到对应的小组
        const groups = await GroupModel.coll.find({ domainId, activation: { $in: [code] } }).toArray();
        if (!groups.length) throw new ActivationCodeNotFoundError(code);
        const group = groups[0];

        // 从token中获取激活码记录
        const token = await TokenModel.get(code, TokenModel.TYPE_ACTIVATION);
        if (!token) {
            // 有可能是TTL删除了过期token，在group中删除对应code再throw
            await GroupModel.coll.updateOne({ _id: group._id }, { $pull: { activation: code } });
            throw new ActivationCodeNotFoundError(code);
        }

        // 校验token有效性
        if (token.expireAt < new Date()) throw new ActivationCodeExpiredError(code, token.expireAt);
        if (!token.remaining || token.remaining <= 0) throw new ActivationCodeUsedError(code);

        // 防止重复激活
        if (group.uids.includes(uid)) throw new DuplicatedActivationError(group.name);

        // 激活 & 消耗次数
        await Promise.all([
            GroupModel.coll.updateOne({ _id: group._id }, { $addToSet: { uids: uid } }),
            TokenModel.updateActCode(code, { remaining: token.remaining - 1 }),
        ]);
        await app.parallel('user/delcache', JSON.stringify(pick(this.user, ['_id', 'uanme', 'email'])));

        logger.info(`User ${uid} activate group ${group.name} successfully with code ${code}`);
        await OplogModel.log(this, 'group.activate', { code, group: group.name });

        this.response.body = { success: true, group: group.name };
    }
}

export class GroupCodeEditHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM.PERM_EDIT_DOMAIN);
    }

    @param('gid', Types.ObjectId)
    async get(domainId: string, gid?: ObjectID) {
        // 有gid就查一组
        const gdoc = await GroupModel.getById(domainId, gid);
        if (!gdoc) throw new GroupNotFoundError(gid);
        const tokens = await TokenModel.getMulti(TokenModel.TYPE_ACTIVATION, {
            _id: { $in: gdoc.activation ?? [] },
        }).toArray();
        // 更新查询结果，删除无效的激活码
        GroupModel.coll.updateOne({ _id: gdoc._id }, { $set: { activation: tokens.map((i) => i._id) } });
        this.response.body = { group: gdoc, tokens };
    }

    @param('gid', Types.ObjectId)
    @param('expireAt', Types.Date)
    @param('times', Types.PositiveInt, true)
    @param('owner', Types.String, true)
    @param('genNum', Types.PositiveInt, true)
    async postAdd(domainId: string, gid: ObjectID, expireAt: Date, times = 1, owner = '', genNum = 1) {
        const gdoc = await GroupModel.getById(domainId, gid);
        if (!gdoc) throw new GroupNotFoundError(gid);
        const tokens = await TokenModel.addActCode(expireAt, times, owner, {}, genNum);
        await GroupModel.coll.updateOne({ _id: gdoc._id }, { $addToSet: { activation: { $each: tokens.map((i) => i._id) } } });
        this.response.body = { success: true, data: tokens };
        this.response.redirect = this.url('domain_group');
    }
}

export class GroupCodeExportHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM.PERM_EDIT_DOMAIN);
    }

    async get() {
        const gdocs = await GroupModel.list(this.domain._id);
        const codes = gdocs.map((i) => i.activation).flat();
        const tdict = await TokenModel.getMulti(TokenModel.TYPE_ACTIVATION, { _id: { $in: codes } }).toArray();
        this.response.body = { groups: gdocs, tokens: tdict };
    }
}

export function apply(ctx: Context) {
    global.Hydro.model.group = GroupModel;
    /**
     * 该接口用于查询和更新用户是否具有某组别的权限
     * 实现基于user.group的树状结构，与domain.permission有本质区别，可以灵活地创建多个权限树
     */
    ctx.Route('privilege_group', '/priv', GroupOperationHandler);
    ctx.Route('domain_group_code_export', '/domain/group/code', GroupCodeExportHandler);
    ctx.Route('domain_group_code_edit', '/domain/group/:gid/code', GroupCodeEditHandler);
}
