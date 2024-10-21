import { avatar, Context, Handler, ObjectId, paginate, param, PRIV, route, Types } from 'hydrooj';
import { GroupNotFoundError } from '../privilege-group/lib';
import { UserGroupModel } from './model';

class UserGroupHandler extends Handler {
    @param('page', Types.Int, true)
    @param('pageSize', Types.Int, true)
    async get(domainId: string, page: number = 1, pageSize = 10) {
        if (pageSize > 20) pageSize = 20;
        const cursor = UserGroupModel.list(domainId, this.user._id).sort({ createdAt: -1 });
        const [data, pageCount, count] = await paginate(cursor, page, pageSize);
        this.response.body = {
            data: {
                data,
                page,
                pageSize,
                pageCount,
                count,
            },
        };
    }

    @param('uids', Types.NumericArray)
    @param('alias', Types.String, true)
    @param('ownerAlias', Types.String, true)
    @param('desc', Types.String, true)
    @param('city', Types.String, true)
    async post(domainId: string, uids: number[], alias: string = '', ownerAlias: string = '', desc: string = '', city: string = '') {
        const _id = await UserGroupModel.add({
            domainId,
            desc,
            city,
            alias,
            ownerAlias,
            owner: this.user._id,
            uids,
        });
        this.response.body = { data: { _id } };
    }
}

class UserGroupAttendHandler extends Handler {
    @param('page', Types.Int, true)
    @param('pageSize', Types.Int, true)
    async get(domainId: string, page: number = 1, pageSize = 10) {
        if (pageSize > 20) pageSize = 20;
        const cursor = UserGroupModel.listAttend(domainId, this.user._id).sort({ createdAt: -1 });
        const [data, pageCount, count] = await paginate(cursor, page, pageSize);
        this.response.body = {
            data: {
                data,
                page,
                pageSize,
                pageCount,
                count,
            },
        };
    }
}

class UserGroupMaintainHandler extends Handler {
    @param('page', Types.Int, true)
    @param('pageSize', Types.Int, true)
    async get(domainId: string, page: number = 1, pageSize = 10) {
        if (pageSize > 20) pageSize = 20;
        const cursor = UserGroupModel.listMaintain(domainId, this.user._id).sort({ createdAt: -1 });
        const [data, pageCount, count] = await paginate(cursor, page, pageSize);
        this.response.body = {
            data: {
                data,
                page,
                pageSize,
                pageCount,
                count,
            },
        };
    }
}

class UserGroupOneHandler extends Handler {
    @route('groupId', Types.ObjectId)
    async get(domainId: string, groupId: ObjectId) {
        const groupDoc = await UserGroupModel.get(domainId, groupId);
        if (!groupDoc || !(groupDoc.owner === this.user._id || groupDoc.uids.includes(this.user._id))) throw new GroupNotFoundError();
        this.response.body = {
            data: groupDoc,
        };
    }

    @route('groupId', Types.ObjectId)
    @param('uids', Types.NumericArray)
    @param('alias', Types.String)
    @param('ownerAlias', Types.String)
    @param('desc', Types.String, true)
    @param('city', Types.String, true)
    async put(
        domainId: string,
        groupId: ObjectId,
        uids: number[],
        alias: string = '',
        ownerAlias: string = '',
        desc: string = '',
        city: string = '',
    ) {
        const groupDoc = await UserGroupModel.get(domainId, groupId);
        if (!groupDoc || groupDoc.owner !== this.user._id) throw new GroupNotFoundError();
        const _id = await UserGroupModel.insertOrUpdate({
            domainId,
            _id: groupId,
            desc,
            city,
            alias,
            ownerAlias,
            owner: this.user._id,
            uids,
        });
        this.response.body = { data: { _id: _id || groupId } };
    }

    @route('groupId', Types.ObjectId)
    async delete(domainId: string, groupId: ObjectId) {
        const groupDoc = await UserGroupModel.get(domainId, groupId);
        if (!groupDoc || groupDoc.owner !== this.user._id) throw new GroupNotFoundError();
        const count = await UserGroupModel.del({
            domainId,
            _id: groupId,
        });
        this.response.body = {
            success: !!count,
        };
    }
}

class UserGroupMembersHandler extends Handler {
    @route('groupId', Types.ObjectId)
    @param('page', Types.Int, true)
    @param('pageSize', Types.Int, true)
    async get(domainId: string, groupId: ObjectId, page = 1, pageSize = 10) {
        const groupDoc = await UserGroupModel.get(domainId, groupId);
        if (!groupDoc || groupDoc.owner !== this.user._id) throw new GroupNotFoundError();
        const cursor = UserGroupModel.listMembers(groupDoc.uids);
        const [data, pageCount, count] = await paginate(cursor, page, pageSize);
        this.response.body = {
            data: {
                data: data.map((v) => {
                    v.avatarUrl = avatar(v.avatar);
                    return v;
                }),
                page,
                pageSize,
                pageCount,
                count,
            },
        };
    }

    @route('groupId', Types.ObjectId)
    @param('uids', Types.NumericArray)
    async delete(domainId: string, groupId: ObjectId, uids: number[]) {
        const groupDoc = await UserGroupModel.get(domainId, groupId);
        if (!groupDoc || groupDoc.owner !== this.user._id) throw new GroupNotFoundError();
        UserGroupModel.removeMembers(groupId, uids);
        this.response.body = {
            data: {
                count: uids.length,
            },
        };
    }

    @param('unames', Types.CommaSeperatedArray)
    @param('page', Types.Int, true)
    @param('pageSize', Types.Int, true)
    async postCheck(_: string, unames: string[], page = 1, pageSize = 10) {
        pageSize = pageSize > 20 ? 20 : pageSize;
        const cursor = UserGroupModel.listMembersByName(unames);
        const [data, pageCount, count] = await paginate(cursor, page, pageSize);
        this.response.body = {
            data: {
                data,
                page,
                pageSize,
                pageCount,
                count,
            },
        };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('user_group', '/user-group', UserGroupHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_group', '/user-group/attend', UserGroupAttendHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_group', '/user-group/maintain', UserGroupMaintainHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_group_members', '/user-group/:groupId/members', UserGroupMembersHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_group_one', '/user-group/:groupId', UserGroupOneHandler, PRIV.PRIV_USER_PROFILE);
}
