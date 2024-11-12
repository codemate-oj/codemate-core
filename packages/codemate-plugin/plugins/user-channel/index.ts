import { Context, Handler, ObjectId, paginate, param, PERM, PRIV, route, Types } from 'hydrooj';
import { ChannelModel, ChannelNotFoundError } from './model';

class ChannelHandler extends Handler {
    @param('page', Types.PositiveInt, true)
    @param('pageSize', Types.PositiveInt, true)
    async get(domainId: string, page = 1, pageSize = 10) {
        if (pageSize > 20) pageSize = 20;
        const cursor = ChannelModel.listAll(domainId);
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

    @param('name', Types.String)
    @param('owner', Types.UnsignedInt)
    @param('linkAlias', Types.Float, true)
    @param('phone', Types.Phone, true)
    @param('email', Types.Email, true)
    @param('level', Types.String, true)
    @param('percentage', Types.Float, true)
    @param('beginAt', Types.UnsignedInt, true)
    @param('endAt', Types.UnsignedInt, true)
    @param('content', Types.Content, true)
    async post(
        domainId: string,
        name: string,
        owner: number,
        linkAlias: number,
        phone: string,
        email: string,
        level: string,
        percentage: number, // commission_percentage
        beginAt: number,
        endAt: number,
        content: string,
    ) {
        const channelId = await ChannelModel.add({
            domainId,
            name,
            owner,
            linkAlias,
            phone,
            beginAt: new Date(beginAt),
            endAt: new Date(endAt),
            email,
            level,
            percentage,
            content,
        });
        this.response.body = { data: { _id: channelId } };
    }
}

class UserChannelMyHandler extends Handler {
    @param('page', Types.PositiveInt, true)
    @param('pageSize', Types.PositiveInt, true)
    async get(domainId: string, page = 1, pageSize = 10) {
        if (pageSize > 20) pageSize = 20;
        const cursor = await ChannelModel.listAll(domainId, {
            owner: this.user._id,
        });
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

class UserChannelAliasHandler extends Handler {
    @route('alias', Types.Int)
    @param('redirect', Types.Boolean, true)
    async get(domainId: string, alias: number, redirect = true) {
        const channelDoc = await ChannelModel.getByAlias(domainId, alias);
        if (redirect) {
            this.response.redirect = `/?inviteCode=${channelDoc?.docId ?? ''}`;
        } else {
            this.response.body = {
                data: { inviteCode: channelDoc.inviteCode },
            };
        }
    }
}

class UserChannelCheckHandler extends Handler {
    @param('domainId', Types.String, true)
    async get(domainId: string) {
        const channelDoc = await ChannelModel.getByFilters(domainId, { owner: this.user._id });
        this.response.body = {
            data: {
                isChannel: !!channelDoc?._id,
            },
        };
    }
}

class UserChannelOneHandler extends Handler {
    @route('channelId', Types.ObjectId)
    async get(domainId: string, channelId: ObjectId) {
        const channelDoc = await ChannelModel.get(domainId, channelId);
        if (!channelDoc || !(this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM) || channelDoc.owner === this.user._id))
            throw new ChannelNotFoundError(channelId);
        this.response.body = {
            data: channelDoc,
        };
    }

    @route('channelId', Types.ObjectId)
    @param('name', Types.String)
    @param('owner', Types.UnsignedInt)
    @param('linkAlias', Types.Float, true)
    @param('phone', Types.Phone, true)
    @param('email', Types.Email, true)
    @param('level', Types.String, true)
    @param('percentage', Types.Float, true)
    @param('beginAt', Types.UnsignedInt, true)
    @param('endAt', Types.UnsignedInt, true)
    @param('content', Types.Content, true)
    async put(
        domainId: string,
        channelId: ObjectId,
        name: string,
        owner: number,
        linkAlias: number,
        phone: string,
        email: string,
        level: string,
        percentage: number, // commission_percentage
        beginAt: number,
        endAt: number,
        content: string,
    ) {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        const currentDate = new Date();
        const channelDoc = await ChannelModel.get(domainId, channelId);
        if (!channelDoc) throw new ChannelNotFoundError(channelId);
        await ChannelModel.edit(channelId, {
            name,
            content,
            owner,
            linkAlias,
            phone,
            beginAt: new Date(beginAt),
            endAt: new Date(endAt),
            email,
            level,
            percentage,
            updatedAt: currentDate,
        });
        this.response.body = { data: { _id: channelId } };
    }
}

class UserChannelInvitedHandler extends Handler {
    @route('inviteCode', Types.String)
    @param('page', Types.PositiveInt, true)
    @param('pageSize', Types.PositiveInt, true)
    async get(_: string, inviteCode: string, page = 1, pageSize = 10) {
        if (pageSize > 20) pageSize = 20;
        const cursor = await ChannelModel.listUsersByCode(inviteCode);
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

class UserChannelGroupStatHandler extends Handler {
    @param('beginAt', Types.UnsignedInt, true)
    @param('endAt', Types.UnsignedInt, true)
    @param('by', Types.CommaSeperatedArray, true)
    @param('page', Types.PositiveInt, true)
    @param('pageSize', Types.PositiveInt, true)
    @param('statRules', Types.CommaSeperatedArray, true)
    async get(domainId: string, beginAt: number, endAt: number, by: string[], page = 1, pageSize = 10, statRules: string[] = []) {
        if (pageSize > 20) pageSize = 20;
        const definedStatDates = statRules.map((v) => {
            const [beginAtStr, endAtStr] = v.split('|');
            return {
                beginAt: new Date(parseInt(beginAtStr, 10)),
                endAt: new Date(parseInt(endAtStr, 10)),
            };
        });
        const result = await (
            await ChannelModel.getChannelAggr(domainId, ['groupBy', ...(by || []).map((v: string) => `groupBy${v}`)], {
                owner: this.user._id,
                definedStatDates,
                beginAt: beginAt && new Date(beginAt),
                endAt: endAt && new Date(endAt),
                page,
                pageSize,
            })
        ).toArray();
        const count = result[0]?.count || 0;
        const pageCount = Math.ceil(count / pageSize);
        this.response.body = {
            data: {
                data: result[0]?.data || [],
                count,
                page,
                pageSize,
                pageCount,
            },
        };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('user_channel', '/user-channel', ChannelHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('user_channel_my', '/user-channel/my', UserChannelMyHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_channel_role', '/user-channel/check', UserChannelCheckHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_channel_groupStat', '/user-channel/stat', UserChannelGroupStatHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_channel_invited', '/user-channel/invited/:inviteCode', UserChannelInvitedHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_channel_alias', '/user-channel/alias/:alias', UserChannelAliasHandler);
    ctx.Route('user_channel_one', '/user-channel/:channelId', UserChannelOneHandler, PRIV.PRIV_USER_PROFILE);
}
