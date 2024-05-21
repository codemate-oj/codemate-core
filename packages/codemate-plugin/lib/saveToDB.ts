import { db } from 'hydrooj';

interface PersistentVars {
    docKey: string;

    [key: string]: any;
}

declare module 'hydrooj' {
    interface Collections {
        persistentVars: PersistentVars;
    }
}
const coll = db.collection('persistentVars');

export default async function saveToDB<T extends object>(docKey: string): Promise<T> {
    let obj = (await coll.findOne({ docKey })) || {};
    if (!obj) {
        obj = { docKey };
        await coll.insertOne(obj as PersistentVars);
    }
    return new Proxy(obj as T, {
        set: (target, p, newValue) => {
            target[p] = newValue;
            coll.findOneAndUpdate(
                { docKey },
                {
                    $set: {
                        docKey,
                        [p]: newValue,
                    },
                },
                { upsert: true },
            ).then();
            return true;
        },
    });
}
