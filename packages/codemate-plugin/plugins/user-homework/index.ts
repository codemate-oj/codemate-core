import {
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

    @param('beginAt', Types.PositiveInt)
    @param('penaltySince', Types.PositiveInt)
    @param('extensionDays', Types.Float)
    @param('penaltyRules', Types.CommaSeperatedArray)
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('pids', Types.NumericArray)
    @param('rated', Types.Boolean)
    @param('isPublished', Types.Boolean, true)
    @param('maintainer', Types.NumericArray, true)
    @param('assign', Types.CommaSeperatedArray, true)
    async post(
        domainId: string,
        beginAt: number,
        penaltySince: number,
        extensionDays: number,
        penaltyRules: string[] = ['1|1'],
        title: string,
        content: string,
        pids: number[],
        rated = false,
        isPublished: false,
        maintainer: number[] = [],
        assign: string[] = [],
    ) {
        this.checkPerm(PERM.PERM_CREATE_HOMEWORK);
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
    @param('beginAt', Types.PositiveInt)
    @param('penaltySince', Types.PositiveInt)
    @param('extensionDays', Types.Float)
    @param('penaltyRules', Types.CommaSeperatedArray)
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('pids', Types.NumericArray)
    @param('rated', Types.Boolean)
    @param('isPublished', Types.Boolean, true)
    @param('maintainer', Types.NumericArray, true)
    @param('assign', Types.CommaSeperatedArray, true)
    async put(
        domainId: string,
        homeworkId: ObjectId,
        beginAt: number,
        penaltySince: number,
        extensionDays: number,
        penaltyRules: string[] = ['1|1'],
        title: string,
        content: string,
        pids: number[] = [],
        rated = false,
        isPublished: false,
        maintainer: number[] = [],
        assign: string[] = [],
    ) {
        const homeworkDoc = await UserHomeworkModel.get(domainId, homeworkId);
        if (!homeworkDoc) throw new HomeworkNotFoundError(homeworkId);
        this.checkPerm(PERM.PERM_EDIT_HOMEWORK_SELF);
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
        });
        if (
            homeworkDoc.beginAt.getTime() !== beginAt ||
            homeworkDoc.endAt.getTime() !== endAt ||
            homeworkDoc.penaltySince?.getTime() !== penaltySince ||
            homeworkDoc.pids.sort().join(',') !== pids.sort().join(',')
        ) {
            await ContestModel.recalcStatus(domainId, homeworkDoc.docId);
        }
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

class UserHomeworkMembersHandler extends Handler {
    @route('homeworkId', Types.ObjectId)
    @param('page', Types.PositiveInt, true)
    @param('pageSize', Types.PositiveInt, true)
    async get(domainId: string, homeworkId: ObjectId, page = 1, pageSize = 10) {
        const cursor = await UserHomeworkModel.listMembers(domainId, homeworkId);
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
    ctx.Route('user_homework', '/user-homework', UserHomeworkHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_homework_one', '/user-homework/:homeworkId', UserHomeworkOneHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_homework_problems', '/user-homework/:homeworkId/problems', UserHomeworkProblemsHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_homework_members', '/user-homework/:homeworkId/members', UserHomeworkMembersHandler, PRIV.PRIV_USER_PROFILE);
}
