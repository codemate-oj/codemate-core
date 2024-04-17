import { Context, Err, ForbiddenError, Handler, param, PERM, PRIV, Types, ValidationError } from 'hydrooj';
import { ActivationCodeExpiredError, ActivationCodeNotFoundError, ActivationCodeUsedError, GroupNotFoundError, logger } from './lib';
import { ActivationCode, collGroup, GroupModel } from './model';

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
        const g = await GroupModel.activate(domainId, code, uid);
        logger.info(`User ${uid} activate group ${g.name} successfully with code ${code}`);
    }
}

export class GroupCodeEditHandler extends Handler {
    prepare() {
        this.checkPerm(PERM.PERM_EDIT_DOMAIN);
    }

    parseAndValidateData(data: string) {
        try {
            const obj = JSON.parse(data);
            if (!Array.isArray(obj)) throw new Error();
            const ans = obj.map((item) => {
                if (!item.code) throw new Error('code');
                if (!item.expiredAt) throw new Error('expiredAt');
                if (!item.remaining) throw new Error('remaining');
                if (item.expiredAt < new Date()) throw new Error('expiredAt < now');
                if (item.remaining < 0) throw new Error('remaining < 0');
                return { createdAt: new Date(), ...item } as any as ActivationCode;
            });
            return ans;
        } catch (e) {
            throw new ValidationError('data', e.message);
        }
    }

    @param('group', Types.String)
    @param('data', Types.String)
    async post(domainId: string, group: string, data: string) {
        const gdoc = await GroupModel.get(domainId, group);
        if (!gdoc) throw new GroupNotFoundError(group);
        const _data = this.parseAndValidateData(data);
        GroupModel.setActivationCodes(gdoc._id, _data);
        this.response.body = { success: true, data: _data };
        this.response.redirect = this.url('domain_group');
    }
}

export function apply(ctx: Context) {
    global.Hydro.model.group = GroupModel;
    /**
     * 该接口用于查询和更新用户是否具有某组别的权限
     * 实现基于user.group的树状结构，与domain.permission有本质区别，可以灵活地创建多个权限树
     */
    ctx.Route('privilege_group', '/priv', GroupOperationHandler);
    ctx.Route('domain_group_code_edit', '/domain/group/code', GroupCodeEditHandler);
}
