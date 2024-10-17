import {
    avatar,
    ContestModel,
    Context,
    Handler,
    HomeworkNotLiveError,
    ObjectId,
    paginate,
    param,
    PERM,
    PRIV,
    RecordModel,
    route,
    StorageModel,
    Types,
} from 'hydrooj';
import { UserGroupModel } from '../user-group/model';
import { HomeworkNotFoundError, UserHomeworkModel } from './model';

class UserHomeworkHandler extends Handler {
    @param('page', Types.PositiveInt, true)
    @param('pageSize', Types.PositiveInt, true)
    async get(domainId: string, page = 1, pageSize = 10) {
        if (pageSize > 20) pageSize = 20;
        const cursor = ContestModel.getMulti(domainId, {
            rule: 'homework',
            // 确保新建用户时，用户名及与用户名相同的组名都是唯一
            $or: [{ maintainer: this.user._id }, { owner: this.user._id }, { assign: { $in: this.user.group } }, { assign: { $size: 0 } }],
        }).sort({
            penaltySince: 1,
            endAt: 1,
            beginAt: -1,
            _id: -1,
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

    @param('beginAt', Types.UnsignedInt)
    @param('penaltySince', Types.UnsignedInt)
    @param('extensionDays', Types.Float)
    @param('penaltyRules', Types.CommaSeperatedArray, true)
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('pids', Types.NumericArray)
    @param('rated', Types.Boolean)
    @param('isPublished', Types.Boolean, true)
    @param('members', Types.NumericArray)
    @param('maintainer', Types.NumericArray, true)
    @param('assign', Types.CommaSeperatedArray, true)
    async post(
        domainId: string,
        beginAt: number,
        penaltySince: number,
        extensionDays: number,
        penaltyRules: string[],
        title: string,
        content: string,
        pids: number[],
        rated: boolean,
        isPublished: false,
        members: number[] = [],
        maintainer: number[] = [],
        assign: string[] = [],
    ) {
        this.checkPerm(PERM.PERM_CREATE_HOMEWORK);
        const currentDate = new Date();
        // 定时发布的作业
        beginAt ||= currentDate.getTime();
        // 默认是四千小时
        penaltySince ||= new Date(beginAt + 4000 * 60 * 60 * 1000).getTime();
        // 默认不推迟
        extensionDays ||= 0;
        // 默认超时不扣分
        penaltyRules ||= ['1|1'];
        const endAt = penaltySince + extensionDays * 24 * 60 * 60 * 1000;
        const homeworkId = await ContestModel.add(
            domainId,
            title,
            content,
            this.user._id,
            'homework',
            new Date(beginAt),
            new Date(endAt),
            pids,
            rated,
            {
                penaltySince: new Date(penaltySince),
                penaltyRules: penaltyRules
                    .map((v) => v.split('|'))
                    .reduce((acc, [key, value]) => {
                        acc[key] = +value;
                        return acc;
                    }, {}),
                maintainer,
                assign,
                isPublished,
            },
        );
        await UserHomeworkModel.setAllAttendUids(domainId, homeworkId, members);
        this.response.body = { data: { _id: homeworkId } };
    }
}

class UserHomeworkOneHandler extends Handler {
    @route('homeworkId', Types.ObjectId)
    async get(domainId: string, homeworkId: ObjectId) {
        const homeworkDoc = await UserHomeworkModel.get(domainId, homeworkId);
        if (!homeworkDoc) throw new HomeworkNotFoundError(homeworkId);
        this.response.body = {
            data: homeworkDoc,
        };
    }

    @route('homeworkId', Types.ObjectId)
    @param('beginAt', Types.UnsignedInt)
    @param('penaltySince', Types.UnsignedInt)
    @param('extensionDays', Types.Float)
    @param('penaltyRules', Types.CommaSeperatedArray, true)
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('pids', Types.NumericArray)
    @param('rated', Types.Boolean, true)
    @param('isPublished', Types.Boolean, true)
    @param('members', Types.NumericArray)
    @param('maintainer', Types.NumericArray, true)
    @param('assign', Types.CommaSeperatedArray, true)
    async put(
        domainId: string,
        homeworkId: ObjectId,
        beginAt: number,
        penaltySince: number,
        extensionDays: number,
        penaltyRules: string[],
        title: string,
        content: string,
        pids: number[] = [],
        rated: boolean,
        isPublished: false,
        members: number[] = [],
        maintainer: number[] = [],
        assign: string[] = [],
    ) {
        const currentDate = new Date();
        const homeworkDoc = await UserHomeworkModel.get(domainId, homeworkId);
        if (!homeworkDoc) throw new HomeworkNotFoundError(homeworkId);
        this.checkPerm(PERM.PERM_EDIT_HOMEWORK_SELF);
        // 常规任务： 作业的 beginAt < currentDate
        // 限时任务： 作业的 beginAt > currentDate

        // 学生端
        // 作业已完成： 作业中的题目已经全部提交过
        // 作业超时完成： 指作业的题目存在 penaltySince 之后提交完成的
        // 作业待完成： 作业中的题目存在未提交代码的题目

        // 老师端
        // 作业待发布： 作业的 isPublished 为 false
        // 作业已发布： 作业的 isPublished 为 true
        // 作业已发布待检查： 作业的 penaltySince > currentDate
        // 作业待检查已检查： 手动设置状态 isReviewed 为 true

        // 一般来说，检查小组的作业也可以是个人为粒度
        // 考虑当有人在检查作业之后继续延时提交新的题目题解的场景
        // 个人级别的 review 状态方便老师快速定位需要重新 review 的个人
        // 如果更细一点的粒度的话，也可以设置成按题目为粒度
        // 题目级别的 review 状态方便老师快速定义需要重新 review 的题目

        // review 的一般相关字段： reviewStatus（pending，approved，rejected），reviewedBy，reviewedAt，comments

        // 一般来说，已发布的作业一般不能轻易修改
        // 已经发布的作业，在这个接口不能更改其已发布的状态
        isPublished ||= homeworkDoc.isPublished;
        rated ||= false;
        // 定时发布的作业
        if (!isPublished) {
            beginAt ||= currentDate.getTime();
            // 默认是四千小时
            penaltySince ||= new Date(beginAt + 4000 * 60 * 60 * 1000).getTime();
            extensionDays = 0;
        } else {
            beginAt ||= homeworkDoc.beginAt.getTime();
            penaltySince ||= homeworkDoc.penaltySince.getTime();
            extensionDays ||= homeworkDoc.penaltySince.extensionDays || 0;
        }
        // 默认超时不扣分
        penaltyRules ||= ['1|1'];
        const endAt = penaltySince + extensionDays * 24 * 60 * 60 * 1000;
        await ContestModel.edit(domainId, homeworkId, {
            title,
            content,
            beginAt: new Date(beginAt),
            endAt: new Date(endAt),
            pids,
            penaltySince: new Date(penaltySince),
            penaltyRules: penaltyRules
                .map((v) => v.split('|'))
                .reduce((acc, [key, value]) => {
                    acc[key] = +value;
                    return acc;
                }, {}),
            rated,
            maintainer,
            assign,
            isPublished,
            updatedAt: currentDate,
        });
        if (
            homeworkDoc.beginAt.getTime() !== beginAt ||
            homeworkDoc.endAt.getTime() !== endAt ||
            homeworkDoc.penaltySince?.getTime() !== penaltySince ||
            homeworkDoc.pids.sort().join(',') !== pids.sort().join(',')
        ) {
            await ContestModel.recalcStatus(domainId, homeworkDoc.docId);
        }
        await UserHomeworkModel.setAllAttendUids(domainId, homeworkId, members);
        this.response.body = { data: { _id: homeworkId } };
    }

    @route('homeworkId', Types.ObjectId)
    async postAttend(domainId: string, homeworkId: ObjectId) {
        this.checkPerm(PERM.PERM_ATTEND_HOMEWORK);
        const homeworkDoc = await UserHomeworkModel.get(domainId, homeworkId);
        if (ContestModel.isDone(homeworkDoc)) throw new HomeworkNotLiveError(homeworkDoc.docId);
        await ContestModel.attend(domainId, homeworkId, this.user._id);
        this.response.body = {
            success: true,
        };
    }

    @route('homeworkId', Types.ObjectId)
    async delete(domainId: string, homeworkId: ObjectId) {
        const homeworkDoc = await UserHomeworkModel.get(domainId, homeworkId);
        if (!homeworkDoc || homeworkDoc.owner !== this.user._id) throw new HomeworkNotFoundError(homeworkId);
        await Promise.all([
            RecordModel.updateMulti(domainId, { domainId, contest: homeworkId }, undefined, undefined, { contest: '' }),
            ContestModel.del(domainId, homeworkId),
            StorageModel.del(homeworkDoc.files?.map((i) => `contest/${domainId}/${homeworkId}/${i.name}`) || [], this.user._id),
        ]);
        this.response.body = {
            success: true,
        };
    }
}

class UserHomeworkOnePublishHandler extends Handler {
    @route('homeworkId', Types.ObjectId)
    async post(domainId: string, homeworkId: ObjectId) {
        const homeworkDoc = await UserHomeworkModel.get(domainId, homeworkId);
        if (!homeworkDoc || homeworkDoc.owner !== this.user._id) throw new HomeworkNotFoundError(homeworkId);
        this.checkPerm(PERM.PERM_EDIT_HOMEWORK_SELF);
        await UserHomeworkModel.setPublish(domainId, homeworkId, true);
        this.response.body = {
            success: true,
        };
    }

    @route('homeworkId', Types.ObjectId)
    async delete(domainId: string, homeworkId: ObjectId) {
        const homeworkDoc = await UserHomeworkModel.get(domainId, homeworkId);
        if (!homeworkDoc || homeworkDoc.owner !== this.user._id) throw new HomeworkNotFoundError(homeworkId);
        this.checkPerm(PERM.PERM_EDIT_HOMEWORK_SELF);
        await UserHomeworkModel.setPublish(domainId, homeworkId, false);
        this.response.body = {
            success: true,
        };
    }
}

class UserHomeworkProblemsHandler extends Handler {
    @route('homeworkId', Types.ObjectId)
    @param('page', Types.PositiveInt, true)
    @param('pageSize', Types.PositiveInt, true)
    async get(domainId: string, homeworkId: ObjectId, page = 1, pageSize = 10) {
        const cursor = await UserHomeworkModel.listProblems(domainId, homeworkId);
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

class UserHomeworkProblemOptionsHandler extends Handler {
    @param('homeworkId', Types.ObjectId, true)
    @param('pids', Types.NumericArray, true)
    @param('pidsAlias', Types.CommaSeperatedArray, true)
    @param('page', Types.PositiveInt, true)
    @param('pageSize', Types.PositiveInt, true)
    async get(domainId: string, homeworkId: ObjectId, pids: number[], pidAlias: string[], page = 1, pageSize = 20) {
        pids ||= [];
        pidAlias ||= [];
        if (pageSize > 100) pageSize = 100;
        const homeworkDoc = await UserHomeworkModel.get(domainId, homeworkId);
        if (homeworkDoc) {
            pids = [...new Set([...pids, ...homeworkDoc.pids])];
        }
        const cursor = await UserHomeworkModel.getProblemOptions(domainId, pids, pidAlias);
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

class UserHomeworkUserOptionsHandler extends Handler {
    @param('groupId', Types.ObjectId, true)
    @param('uids', Types.NumericArray, true)
    @param('unames', Types.CommaSeperatedArray, true)
    @param('page', Types.PositiveInt, true)
    @param('pageSize', Types.PositiveInt, true)
    async get(domainId: string, groupId: ObjectId, uids: number[], unames: string[], page = 1, pageSize = 20) {
        uids ||= [];
        unames ||= [];
        if (pageSize > 100) pageSize = 100;
        const groupDoc = await UserGroupModel.get(domainId, groupId);
        if (groupDoc) {
            uids = [...new Set([...uids, ...groupDoc.uids])];
        }
        const cursor = await UserHomeworkModel.getUserOptions(uids, unames);
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
}

class UserHomeworkMembersHandler extends Handler {
    @route('homeworkId', Types.ObjectId)
    @param('page', Types.PositiveInt, true)
    @param('pageSize', Types.PositiveInt, true)
    async get(domainId: string, homeworkId: ObjectId, page = 1, pageSize = 10) {
        const cursor = await UserHomeworkModel.listMembers(domainId, homeworkId);
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
}

class UserHomeworkReviewHandler extends Handler {
    @route('homeworkId', Types.ObjectId)
    @param('isReviewed', Types.Boolean, true)
    async post(domainId: string, homeworkId: ObjectId, isReviewed) {
        await UserHomeworkModel.setReview(domainId, homeworkId, isReviewed);
        this.response.body = {
            data: {
                _id: homeworkId,
                isReviewed,
            },
        };
    }
}

class UserHomeworkAttendHandler extends Handler {
    @param('page', Types.PositiveInt, true)
    @param('pageSize', Types.PositiveInt, true)
    @param('isFinishAll', Types.Boolean, true)
    async get(domainId: string, page = 1, pageSize = 10, isFinishAll) {
        // 常规任务： 作业的 beginAt < currentDate
        // 限时任务： 作业的 beginAt > currentDate

        // 学生端
        // 作业已完成： 作业中的题目已经全部提交过
        // 作业超时完成： 指作业的题目存在 penaltySince 之后提交完成的
        // 作业待完成： 作业中的题目存在未提交代码的题目
        if (pageSize > 20) pageSize = 20;
        const result = await (
            await UserHomeworkModel.listAttendHomeworksAggr(domainId, this.user._id, {
                attend: 1,
                page,
                pageSize,
                isFinishAll,
            })
        ).toArray();
        const count = result[0]?.count || 0;
        this.response.body = {
            data: {
                data:
                    result[0]?.data.map((v) => ({
                        ...v.homework,
                        isTimeout: v.isTimeout,
                        assignGroup: v.assignGroup,
                        homeworkType: v.homeworkType,
                        finishStatus: v.isFinishAll ? (v.isTimeout ? '超时完成' : '正常完成') : '待完成',
                    })) || [],
                count,
                page,
                pageCount: Math.ceil(count / pageSize),
                pageSize,
            },
        };
    }
}

class UserHomeworkMaintainerHandler extends Handler {
    @param('page', Types.PositiveInt, true)
    @param('pageSize', Types.PositiveInt, true)
    async get(domainId: string, page = 1, pageSize = 10) {
        // 老师端
        // 作业待发布： 作业的 isPublished 为 false
        // 作业已发布： 作业的 isPublished 为 true
        // 作业已发布待检查： 作业的 penaltySince > currentDate
        // 作业待检查已检查： 手动设置状态 isReviewed 为 true
        if (pageSize > 20) pageSize = 20;
        const result = await (
            await UserHomeworkModel.listMaintainHomeworksAggr(domainId, this.user._id, {
                attend: 1,
                page,
                pageSize,
            })
        ).toArray();
        const count = result[0]?.count || 0;
        const pageCount = Math.ceil(count / pageSize);
        this.response.body = {
            data: {
                data:
                    result[0]?.data.map((v) => ({
                        ...v,
                        homeworkStatus: v.isPublished ? (v.isReviewed ? '已检查' : v.penaltySince < new Date() ? '待检查' : '已发布') : '待发布',
                    })) || [],
                count,
                page,
                pageSize,
                pageCount,
            },
        };
    }
}

class UserHomeworkStatHandler extends Handler {
    @route('homeworkId', Types.ObjectId)
    @param('uid', Types.UnsignedInt, true)
    @param('isMaintainer', Types.Boolean, true)
    @param('by', Types.CommaSeperatedArray, true)
    @param('page', Types.PositiveInt, true)
    @param('pageSize', Types.PositiveInt, true)
    async get(domainId: string, homeworkId: ObjectId, uid: number, isMaintainer: boolean, by: string[], page = 1, pageSize = 10) {
        if (pageSize > 20) pageSize = 20;
        // 筛选作业中指定成员 uid，0 表示为当前用户
        uid ||= this.user._id || 0;
        const result = await (
            await UserHomeworkModel.getHomeworkAggr(
                domainId,
                ['assignGroup', 'attendUsers', 'statProblem', 'groupBy', ...(by || []).map((v: string) => `groupBy${v}`)],
                {
                    homeworkId,
                    maintainerUid: isMaintainer && this.user._id,
                    uid: !isMaintainer && uid,
                    attend: 1,
                    page,
                    pageSize,
                },
            )
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

class UserHomeworkGroupStatHandler extends Handler {
    @param('groupId', Types.ObjectId)
    @param('uid', Types.UnsignedInt, true)
    @param('isMaintainer', Types.Boolean, true)
    @param('by', Types.CommaSeperatedArray, true)
    @param('page', Types.PositiveInt, true)
    @param('pageSize', Types.PositiveInt, true)
    async get(domainId: string, groupId: ObjectId, uid: number, isMaintainer: boolean, by: string[], page = 1, pageSize = 10) {
        if (pageSize > 20) pageSize = 20;
        // 筛选作业中指定成员 uid，0 表示为当前用户
        uid ||= this.user._id || 0;
        const groupDoc = await UserGroupModel.get(domainId, groupId);
        const assign = [];
        if (groupDoc) {
            assign.push(groupDoc.name);
        }
        const result = await (
            await UserHomeworkModel.getHomeworkAggr(
                domainId,
                ['assignGroup', 'attendUsers', 'statProblem', 'groupBy', ...(by || []).map((v: string) => `groupBy${v}`)],
                {
                    assign,
                    maintainerUid: isMaintainer && this.user._id,
                    uid: !isMaintainer && uid,
                    attend: 1,
                    page,
                    pageSize,
                },
            )
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
    ctx.Route('user_homework', '/user-homework', UserHomeworkHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_homework_attend', '/user-homework/attend', UserHomeworkAttendHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_homework_maintain', '/user-homework/maintain', UserHomeworkMaintainerHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_homework_userOptions', '/user-homework/users', UserHomeworkUserOptionsHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_homework_problemOptions', '/user-homework/problems', UserHomeworkProblemOptionsHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_homework_groupStat', '/user-homework/stat', UserHomeworkGroupStatHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_homework_one', '/user-homework/:homeworkId', UserHomeworkOneHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_homework_oneStat', '/user-homework/:homeworkId/stat', UserHomeworkStatHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_homework_onePublish', '/user-homework/:homeworkId/publish', UserHomeworkOnePublishHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_homework_problems', '/user-homework/:homeworkId/problems', UserHomeworkProblemsHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_homework_members', '/user-homework/:homeworkId/members', UserHomeworkMembersHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_homework_review', '/user-homework/:homeworkId/review', UserHomeworkReviewHandler, PRIV.PRIV_USER_PROFILE);
}
