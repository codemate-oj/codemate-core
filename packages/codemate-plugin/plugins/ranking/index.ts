import { BadRequestError, Context, DomainModel as domain, Handler, paginate, PERM, query, Types, UserModel as user } from 'hydrooj';

class DomainRankHandler extends Handler {
    @query('page', Types.PositiveInt, true)
    @query('rankBy', Types.String, true)
    async get(domainId: string, page = 1, rankBy: string = 'all') {
        if (!['all', 'Py', 'Cpp', 'Scratch'].includes(rankBy)) throw new BadRequestError();
        const cursor =
            rankBy === 'all'
                ? domain.getMultiUserInDomain(domainId, { uid: { $gt: 1 }, rp: { $gt: 0 } }).sort({ rp: -1 })
                : domain.getMultiUserInDomain(domainId, { uid: { $gt: 1 }, rp: { $gt: 0 } }).sort({ [`rp${rankBy}`]: -1 });
        const [dudocs, upcount, ucount] = await paginate(cursor, page, 100);
        const udict = await user.getList(
            domainId,
            dudocs.map((dudoc) => dudoc.uid),
        );
        const rpInfo: Record<string, any> = {};
        for (const dudoc of dudocs) {
            rpInfo[dudoc.uid] = {
                rp: dudoc.rp || 0,
                rpInfo: dudoc.rpInfo || {},
                rank: dudoc.rank || 0,
                level: dudoc.level || 0,
                nAccept: dudoc.nAccept || 0,
                nSubmit: dudoc.nSubmit || 0,
            };
        }
        const udocs = dudocs.map((i) => udict[i.uid]);
        this.response.template = 'ranking.html';
        this.response.body = {
            udocs,
            upcount,
            ucount,
            rpInfo,
            page,
        };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('ranking', '/ranking', DomainRankHandler, PERM.PERM_VIEW_RANKING);
}
