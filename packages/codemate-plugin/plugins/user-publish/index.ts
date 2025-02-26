import { Context, db, DocumentModel, Handler, paginate, param, PRIV, Types } from 'hydrooj';

const collDoc = db.collection('document');

class PublishProblemHandler extends Handler {
    @param('page', Types.Int, true)
    @param('pageSize', Types.Int, true)
    async get(domainId: string, page: number = 1, pageSize = 10) {
        if (pageSize > 20) pageSize = 20;
        const cursor = collDoc.find({ owner: this.user._id, domainId, docType: DocumentModel.TYPE_PROBLEM }).project({ config: 0 }).sort({ _id: -1 });
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

class PublishProblemSolutionHandler extends Handler {
    @param('page', Types.Int, true)
    @param('pageSize', Types.Int, true)
    async get(domainId: string, page: number = 1, pageSize = 10) {
        if (pageSize > 20) pageSize = 20;
        const cursor = collDoc
            .find({ owner: this.user._id, domainId, docType: DocumentModel.TYPE_PROBLEM_SOLUTION, parentType: DocumentModel.TYPE_PROBLEM })
            .sort({ _id: -1 });
        const [data, pageCount, count] = await paginate(cursor, page, pageSize);
        const problems = await collDoc.find({ domainId, docType: DocumentModel.TYPE_PROBLEM, docId: { $in: data.map((v) => v.parentId) } }).toArray();
        this.response.body = {
            data: {
                data: data.map((v) => {
                    const problem = problems.find((p) => p.docId === v.parentId);
                    return {
                        ...v,
                        title: problem?.title || '题目已删除',
                        pid: problem?.pid,
                    };
                }),
                page,
                pageSize,
                pageCount,
                count,
            },
        };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('user_publish_problem', '/user-publish/problems/my', PublishProblemHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_publish_problem_solution', '/user-publish/problem-solutions/my', PublishProblemSolutionHandler, PRIV.PRIV_USER_PROFILE);
}
