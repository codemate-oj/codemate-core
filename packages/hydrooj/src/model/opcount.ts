import { OpcountExceededError } from '../error';
import db from '../service/db';

const coll = db.collection('opcount');

export async function inc(op: string, ident: string, periodSecs: number, maxOperations: number) {
    const now = new Date().getTime();
    const expireAt = new Date(now - (now % (periodSecs * 1000)) + periodSecs * 1000);
    const count = await coll.countDocuments({
        op,
        ident,
        expireAt,
        opcount: { $gte: maxOperations },
    });
    if (count > 0) {
        throw new OpcountExceededError(op, periodSecs, maxOperations);
    }
    const res = await coll.updateOne(
        {
            op,
            ident,
            expireAt,
            opcount: { $lt: maxOperations },
        },
        { $inc: { opcount: 1 } },
        { upsert: true },
    );
    return res.modifiedCount;
}

export const apply = () =>
    db.ensureIndexes(
        coll,
        { key: { expireAt: -1 }, name: 'expire', expireAfterSeconds: 0 },
        { key: { op: 1, ident: 1, expireAt: 1 }, name: 'optimisticLocking' },
    );
global.Hydro.model.opcount = { inc, apply };
