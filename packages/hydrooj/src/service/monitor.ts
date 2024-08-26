import * as sysinfo from '@hydrooj/utils/lib/sysinfo';
import { Context } from '../context';
import * as bus from './bus';
import db from './db';

const coll = db.collection('status');

export async function update() {
    const [mid, $update] = [{}, {}];
    const $set = {
        ...$update,
        updateAt: new Date(),
        reqCount: 0,
    };
    await bus.parallel('monitor/update', 'server', $set);
    await coll.updateOne({ mid, type: 'server' }, { $set }, { upsert: true });
}

export async function updateJudge(args) {
    const $set = { ...args, updateAt: new Date() };
    await bus.parallel('monitor/update', 'judge', $set);
    return await coll.updateOne({ mid: args.mid, type: 'judge' }, { $set }, { upsert: true });
}

export function apply(ctx: Context) {
    if (process.env.NODE_APP_INSTANCE !== '0') return;
    ctx.on('app/started', async () => {
        sysinfo.get().then((info) => {
            coll.updateOne({ mid: info.mid, type: 'server' }, { $set: { ...info, updateAt: new Date(), type: 'server' } }, { upsert: true });
            setInterval(update, 1800 * 1000);
        });
    });
}
