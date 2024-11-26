import { Context, Handler, ObjectId, paginate, param, PRIV, route, Types } from 'hydrooj';
import { ChannelModel, ChannelNotFoundError } from './model';

const getDefinedDates = (statRules) =>
    statRules.map((v) => {
        const [beginAtStr, endAtStr] = v.split('|');
        return {
            beginAt: new Date(parseInt(beginAtStr, 10)),
            endAt: new Date(parseInt(endAtStr, 10)),
        };
    });

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
        const definedStatDates = getDefinedDates(statRules);
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

class UserSubmitDashboardHandler extends Handler {
    @param('beginAt', Types.UnsignedInt, true)
    @param('endAt', Types.UnsignedInt, true)
    @param('lang', Types.String, true)
    async get(_: string, beginAt: number, endAt: number, lang: string) {
        const $match = {};
        const $and = [];
        if (beginAt) {
            $and.push({ judgeAt: { $gte: new Date(beginAt) } });
        }
        if (endAt) {
            $and.push({ judgeAt: { $lt: new Date(endAt) } });
        }
        if (lang) {
            // ['py.py3', 'cc.cc14o2', 'scratch', '_']
            $and.push({ lang });
        }
        if ($and.length) {
            $match['$and'] = $and;
        }
        const count = await ChannelModel.getSubmitCount($match);
        this.response.body = {
            data: {
                count,
            },
        };
    }

    @param('statRules', Types.CommaSeperatedArray, true)
    async post(_: string, statRules: string[] = []) {
        const definedStatDates = getDefinedDates(statRules);
        const data = await Promise.all(
            definedStatDates.map(({ beginAt, endAt }) =>
                ChannelModel.getSubmitCount({
                    $and: [{ judgeAt: { $lt: endAt } }, { judgeAt: { $gte: beginAt } }],
                }),
            ),
        );
        this.response.body = {
            data: definedStatDates.map((v, i) => ({
                ...v,
                count: data[i],
            })),
        };
    }
}

class UserActiveDashboardHandler extends Handler {
    @param('beginAt', Types.UnsignedInt, true)
    @param('endAt', Types.UnsignedInt, true)
    @param('by', Types.CommaSeperatedArray, true)
    @param('statRules', Types.CommaSeperatedArray, true)
    async get(domainId: string, beginAt: number, endAt: number, by: string[], statRules: string[] = []) {
        const definedStatDates = getDefinedDates(statRules);
        const data = await ChannelModel.getUserOpAggr(domainId, by ?? [], {
            isActive: true,
            definedStatDates,
            beginAt: beginAt && new Date(beginAt),
            endAt: endAt && new Date(endAt),
        }).toArray();
        this.response.body = {
            data,
        };
    }

    @param('statRules', Types.CommaSeperatedArray, true)
    async post(domainId: string, statRules: string[] = []) {
        const definedStatDates = getDefinedDates(statRules);
        const data = await Promise.all(
            definedStatDates.map(({ beginAt, endAt }) => ChannelModel.getUserOpAggr(domainId, [], { beginAt, endAt, isActive: true }).toArray()),
        );
        this.response.body = {
            data: definedStatDates.map((v, i) => ({
                ...v,
                count: data[i][0]?.count || 0,
            })),
        };
    }
}

class UserOpDashboardHandler extends Handler {
    @param('beginAt', Types.UnsignedInt, true)
    @param('endAt', Types.UnsignedInt, true)
    @param('by', Types.CommaSeperatedArray, true)
    @param('statRules', Types.CommaSeperatedArray, true)
    async get(domainId: string, beginAt: number, endAt: number, by: string[], statRules: string[] = []) {
        const definedStatDates = getDefinedDates(statRules);
        const data = await ChannelModel.getUserOpAggr(domainId, by ?? [], {
            definedStatDates,
            beginAt: beginAt && new Date(beginAt),
            endAt: endAt && new Date(endAt),
        }).toArray();
        this.response.body = {
            data,
        };
    }

    @param('statRules', Types.CommaSeperatedArray, true)
    async post(domainId: string, statRules: string[] = []) {
        const definedStatDates = getDefinedDates(statRules);
        const data = await Promise.all(
            definedStatDates.map(({ beginAt, endAt }) => ChannelModel.getUserOpAggr(domainId, [], { beginAt, endAt }).toArray()),
        );
        this.response.body = {
            data: definedStatDates.map((v, i) => ({
                ...v,
                count: data[i][0]?.count || 0,
            })),
        };
    }
}

class UserRegisterDashboardHandler extends Handler {
    @param('beginAt', Types.UnsignedInt, true)
    @param('endAt', Types.UnsignedInt, true)
    async get(_: string, beginAt: number, endAt: number) {
        const $match = {};
        const $and = [];
        if (beginAt) {
            $and.push({ regat: { $gte: new Date(beginAt) } });
        }
        if (endAt) {
            $and.push({ regat: { $lt: new Date(endAt) } });
        }
        if ($and.length) {
            $match['$and'] = $and;
        }
        const count = await ChannelModel.getUserCount($match);
        this.response.body = {
            data: {
                count,
            },
        };
    }

    @param('statRules', Types.CommaSeperatedArray, true)
    async post(_: string, statRules: string[] = []) {
        const definedStatDates = getDefinedDates(statRules);
        const data = await Promise.all(
            definedStatDates.map(({ beginAt, endAt }) =>
                ChannelModel.getUserCount({
                    $and: [{ regat: { $lt: endAt } }, { regat: { $gte: beginAt } }],
                }),
            ),
        );
        this.response.body = {
            data: definedStatDates.map((v, i) => ({
                ...v,
                count: data[i],
            })),
        };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('user_channel', '/user-channel', ChannelHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('user_channel_submit_problem', '/user-channel/dashboard/submit-problem', UserSubmitDashboardHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('user_channel_active_user', '/user-channel/dashboard/active-user', UserActiveDashboardHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('user_channel_op_user', '/user-channel/dashboard/op-user', UserOpDashboardHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('user_channel_register_user', '/user-channel/dashboard/register-user', UserRegisterDashboardHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('user_channel_my', '/user-channel/my', UserChannelMyHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_channel_role', '/user-channel/check', UserChannelCheckHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_channel_groupStat', '/user-channel/stat', UserChannelGroupStatHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_channel_invited', '/user-channel/invited/:inviteCode', UserChannelInvitedHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_channel_alias', '/user-channel/alias/:alias', UserChannelAliasHandler);
    ctx.Route('user_channel_one', '/user-channel/:channelId', UserChannelOneHandler, PRIV.PRIV_USER_PROFILE);
}
