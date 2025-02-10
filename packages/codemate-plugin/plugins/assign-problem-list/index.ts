import {
    type Context,
    Handler,
    moment,
    ObjectId,
    param,
    PenaltyRules,
    PERM,
    PRIV,
    ProblemModel as problem,
    ProblemNotFoundError,
    query,
    route,
    Types,
    yaml,
} from 'hydrooj';
import {
    NotAllowedToVisitPrivateListError,
    ProblemListHiddenError,
    ProblemListNotFountError,
    ProblemNoNextError,
    ProblemNoPreviousError,
    ProblemNotFoundInListError,
} from './lib';
import * as plist from './model';

// 只获取系统题单
export class SystemProblemListMainHandler extends Handler {
    async get() {
        const tdocs = await plist
            .getMulti(this.domain._id, { visibility: 'system' }, ['docId', 'title', 'content', 'parent', 'children', 'hidden'])
            .toArray();

        const enableHidden = this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM);

        const extractChildren = (tdoc: plist.ProblemList) => {
            if (!tdoc) throw new Error();
            if (tdoc.children?.length) {
                return {
                    ...tdoc,
                    children: tdoc.children
                        .map((id) => {
                            const _tdoc = tdocs.find((doc) => doc.docId.equals(id));
                            if (_tdoc && (enableHidden || !_tdoc.hidden)) {
                                return extractChildren(_tdoc);
                            }
                            return false;
                        })
                        .filter((v) => v),
                };
            }
            return { ...tdoc, children: [] };
        };

        const roots = tdocs.filter((item) => !item.parent && (enableHidden || !item.hidden)).map(extractChildren);
        this.response.body = { roots };
        this.response.template = 'system_plist_main.html';
    }
}

export class ProblemListDetailHandler extends Handler {
    tdoc: plist.ProblemList;
    allPids: number[] = [];
    pageCount = 0;

    @route('tid', Types.ObjectId)
    @param('page', Types.PositiveInt, true)
    @param('pageSize', Types.PositiveInt, true)
    async prepare(domainId: string, tid: ObjectId, page = 1, pageSize = 15) {
        const enableHidden = this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM);
        const tdoc = await plist.getWithChildren(domainId, tid, null, enableHidden);

        // 检查权限（bypass超管）
        if (!this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM) && tdoc.visibility === 'private' && !this.user.own(tdoc)) {
            throw new NotAllowedToVisitPrivateListError(tid);
        } else if (tdoc.hidden && !enableHidden) {
            throw new ProblemListHiddenError(tid);
        }

        this.allPids = tdoc.pids;
        this.pageCount = Math.floor((tdoc.pids.length + pageSize - 1) / pageSize);
        tdoc.pids = tdoc.pids.filter((_, index) => index > (page - 1) * pageSize && index < page * pageSize);
        if (!tdoc) throw new ProblemListNotFountError(tid);
        this.tdoc = tdoc;
    }

    @query('page', Types.PositiveInt, true)
    @query('pageSize', Types.PositiveInt, true)
    async get(domainId: string, page = 1, pageSize = 15) {
        const pdict = await problem.getList(domainId, this.tdoc.pids, true, false, problem.PROJECTION_CONTEST_LIST);
        const hasPermission = await plist.checkPerm(domainId, this.tdoc._id, this.user._id);
        this.response.body = {
            tdoc: this.tdoc,
            pdict,
            hasPermission,
            page,
            pageSize,
            pageCount: this.pageCount,
        };
    }

    async checkProblemPerm(pid: string | number) {
        const pdoc = await problem.get(this.domain._id, pid);
        if (!pdoc) throw new ProblemNotFoundError(pid);
        return problem.canViewBy(pdoc, this.user);
    }

    async getProblemInListBy(anchorPid: string | number, offset: number) {
        const pdoc = await problem.get(this.domain._id, anchorPid);
        if (!pdoc) throw new ProblemNotFoundError(anchorPid);
        const index = this.allPids.indexOf(pdoc.docId);
        if (index === -1) throw new ProblemNotFoundInListError(anchorPid);

        const targetIndex = index + offset;
        if (targetIndex > this.allPids.length - 1 || targetIndex < 0)
            throw new (offset > 0 ? ProblemNoNextError : ProblemNoPreviousError)(anchorPid, this.tdoc.docId);
        const targetPid = this.allPids[targetIndex];
        const _perm = await this.checkProblemPerm(targetPid);
        return { pid: targetPid, access: _perm };
    }

    @param('curPid', Types.ProblemId)
    async postNext(_, curPid: string | number) {
        this.response.body = await this.getProblemInListBy(curPid, 1);
    }

    @param('curPid', Types.ProblemId, true)
    async postPrev(_, curPid: string | number) {
        this.response.body = await this.getProblemInListBy(curPid, -1);
    }

    async postCheck() {
        const hasPerm = await plist.checkPerm(this.domain._id, this.tdoc._id, this.user._id);
        this.response.body = {
            hasPermission: hasPerm,
        };
    }
}

export class SystemProblemListEditHandler extends Handler {
    prepare() {
        // 只有域管理员可以编辑/创建系统题单
        this.checkPerm(PERM.PERM_EDIT_DOMAIN);
    }

    @param('tid', Types.ObjectId, true)
    async get(domainId: string, tid: ObjectId) {
        const tdoc = tid ? await plist.get(domainId, tid) : null;
        this.response.template = 'system_plist_edit.html';
        this.response.body = {
            tdoc,
            pids: tid ? tdoc.pids.join(',') : '',
            page_name: tid ? 'homework_edit' : 'homework_create',
        };
    }

    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('pids', Types.Content)
    @param('tid', Types.ObjectId, true)
    @param('hidden', Types.Boolean, true)
    @param('maintainer', Types.NumericArray, true)
    @param('assign', Types.CommaSeperatedArray, true)
    @param('parent', Types.ObjectId, true)
    async postUpdate(
        domainId: string,
        title: string,
        content: string,
        _pids: string,
        _tid: ObjectId = null,
        hidden: boolean = false,
        maintainer: number[] = [],
        assign: string[] = [],
        parent: ObjectId = null,
    ) {
        const pids = _pids
            .replace(/，/g, ',')
            .split(',')
            .map((i) => +i)
            .filter((i) => i);
        let tid = _tid;
        // 有则编辑, 没有则创建
        if (!tid) {
            tid = await plist.add(
                domainId,
                title,
                content,
                this.user._id,
                'system',
                pids,
                {
                    maintainer,
                    assign,
                    hidden,
                },
                parent,
            );
        } else {
            await plist.edit(domainId, tid, {
                title,
                content,
                pids,
                maintainer,
                assign,
                hidden,
                parent,
            });
        }
        // 同步更新assign所有内部题目（只增不减）
        const allPids = (await plist.getWithChildren(domainId, tid)).pids;
        await Promise.all(
            allPids.map(async (pid) => {
                const pdoc = await problem.get(domainId, pid);
                problem.edit(domainId, pid, { assign: Array.from(new Set([...(pdoc.assign ?? []), ...assign])) });
            }),
        );
        this.response.body = { tid };
        this.response.redirect = this.url('system_problem_list_edit', { tid });
    }

    @param('tid', Types.ObjectId)
    async postDelete(domainId: string, tid: ObjectId) {
        const tdoc = await plist.get(domainId, tid);
        if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_EDIT_HOMEWORK);
        await plist.del(domainId, tid);
        this.response.redirect = this.url('system_problem_list_main');
    }
}

export async function apply(ctx: Context) {
    ctx.Route('system_problem_list_main', '/p-list', SystemProblemListMainHandler);
    ctx.Route('system_problem_list_create', '/p-list/create', SystemProblemListEditHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('problem_list_detail', '/p-list/:tid', ProblemListDetailHandler, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('system_problem_list_edit', '/p-list/:tid/edit', SystemProblemListEditHandler, PRIV.PRIV_EDIT_SYSTEM);
}
