import { Context, Handler } from 'hydrooj';

export async function apply(ctx: Context) {
    ctx.on('handler/after/DomainRank', (that: Handler & Record<string, any>) => {
        that.response.body.rpInfo = {};
        for (const udoc of that.response.body.udocs) {
            that.response.body.rpInfo[udoc._id] = {
                rp: udoc.rp || 0,
                rpInfo: udoc.rpInfo || {},
                rank: udoc.rank || 0,
                level: udoc.level || 0,
                nAccept: udoc.nAccept || 0,
                nSubmit: udoc.nSubmit || 0,
            };
        }
    });
}
