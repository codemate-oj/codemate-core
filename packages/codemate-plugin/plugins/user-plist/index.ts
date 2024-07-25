import { Context, Handler, ObjectId, paginate, param, PermissionError, PRIV, ProblemModel, route, Types, ValidationError } from 'hydrooj';
import * as ProblemListModel from '../assign-problem-list/model';

class UserProblemListHandler extends Handler {
    @param('page', Types.Int, true)
    @param('all', Types.Boolean, true)
    @param('pageSize', Types.Int, true)
    async get(domainId: string, page: number = 1, all: boolean = false, pageSize = 10) {
        if (all) this.checkPriv(PRIV.PRIV_VIEW_USER_SECRET); // allow super-admin to view all the problems
        if (pageSize > 20) pageSize = 20;
        const cursor = ProblemListModel.getMulti(domainId, {
            visibility: 'private',
            owner: this.user._id,
        });
        const [pldocs, pldocsPage, pldocsCount] = await paginate(cursor, page, pageSize);
        this.response.body = {
            pldocs,
            pldocsPage,
            pldocsCount,
        };
    }
}

class UserProblemListDetailHandler extends Handler {
    @route('tid', Types.ObjectId)
    @param('page', Types.Int, true)
    @param('pageSize', Types.Int, true)
    async get(domainId: string, tid: ObjectId, page = 1, pageSize = 10) {
        const pldoc = await ProblemListModel.get(domainId, tid);
        if (this.user._id !== pldoc.owner) this.checkPriv(PRIV.PRIV_VIEW_USER_SECRET);
        for (const pid of pldoc.pids) {
            // eslint-disable-next-line no-await-in-loop
            if (!ProblemModel.canViewBy(await ProblemModel.get(domainId, pid), this.user)) throw new PermissionError();
        }
        const itemCount = pldoc.pids.length;
        const pageCount = Math.ceil(pldoc.pids.length / 10);
        pldoc.pids = pldoc.pids.slice((page - 1) * pageSize, page * pageSize - 1);
        const pdict = await ProblemModel.getList(domainId, pldoc.pids);
        this.response.body = {
            pldoc,
            pdict,
            pageCount,
            itemCount,
            pageSize,
            page,
        };
    }
}

class UserProblemListEditHandler extends Handler {
    @route('tid', Types.ObjectId)
    @param('insertPids', Types.NumericArray)
    @param('deletePids', Types.NumericArray)
    @param('title', Types.String)
    @param('content', Types.String)
    async post(domainId: string, tid: ObjectId, insertPids: number[], deletePids: number[], title: string, content: string) {
        const pldoc = await ProblemListModel.get(domainId, tid);
        if (pldoc.owner !== this.user._id) this.checkPriv(PRIV.PRIV_VIEW_USER_SECRET);
        for (const pid of insertPids) {
            // eslint-disable-next-line no-await-in-loop
            const pdoc = await ProblemModel.get(domainId, pid);
            if (!pdoc || !ProblemModel.canViewBy(pdoc, this.user)) throw new PermissionError();
            if (pldoc.pids.includes(pid)) throw new ValidationError(insertPids, null, `Duplicate problem ${pid}.`);
        }
        for (const pid of deletePids) {
            if (!pldoc.pids.includes(pid)) throw new ValidationError(deletePids, null, `Problem ${pid} does not exist.`);
        }
        const pids = pldoc.pids.concat(insertPids).filter((pid) => !deletePids.includes(pid));
        await ProblemListModel.edit(domainId, tid, {
            pids,
            title,
            content,
        });
        this.response.body = {
            success: true,
        };
    }
}

class UserProblemListCreateHandler extends Handler {
    @param('title', Types.String)
    @param('content', Types.String)
    async post(domainId: string, title: string, content: string) {
        const tid = await ProblemListModel.add(domainId, title, content, this.user._id, 'private', []);
        this.response.body = { tid };
    }
}

class UserProblemListDeleteHandler extends Handler {
    @route('tid', Types.ObjectId)
    async post(domainId: string, tid: ObjectId) {
        const pldoc = await ProblemListModel.get(domainId, tid);
        if (pldoc.owner !== this.user._id) this.checkPriv(PRIV.PRIV_VIEW_USER_SECRET);
        await ProblemListModel.del(domainId, tid);
        this.response.body = {
            success: true,
        };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('user_problem_list', '/user-plist', UserProblemListHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_problem_list_create', '/user-plist/create', UserProblemListCreateHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_problem_list_detail', '/user-plist/:tid/detail', UserProblemListDetailHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_problem_list_edit', '/user-plist/:tid/edit', UserProblemListEditHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_problem_list_delete', '/user-plist/:tid/delete', UserProblemListDeleteHandler, PRIV.PRIV_USER_PROFILE);
}
