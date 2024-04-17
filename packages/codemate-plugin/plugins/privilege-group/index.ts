import { Context, Handler, param, Types } from 'hydrooj';
import { ActivationCodeNotFoundError } from './lib';
import { collGroup, GroupModel } from './model';

export class GroupOperationHandler extends Handler {
    @param('group', Types.String)
    @param('uid', Types.PositiveInt)
    async postCheck(domainId: string, name: string, uid: number) {
        const result = await GroupModel.has(domainId, uid, name);
        this.response.body = {
            hasPermission: result,
        };
    }

    @param('uid', Types.PositiveInt)
    @param('code', Types.Content)
    async postActivate(domainId: string, uid: number, code: string) {
        const groups = await collGroup.find({ activation: { $elemMatch: { code } } }).toArray();
        if (!groups.length) throw new ActivationCodeNotFoundError();
        await Promise.all(groups.map((g) => GroupModel.update(domainId, g.name, [...g.uids, uid])));
    }
}

export function apply(ctx: Context) {
    global.Hydro.model.group = GroupModel;
    /**
     * 该接口用于查询和更新用户是否具有某组别的权限
     * 实现基于user.group的树状结构，与domain.permission有本质区别，可以灵活地创建多个权限树
     */
    ctx.Route('privilege_group', '/priv', GroupOperationHandler);
}
