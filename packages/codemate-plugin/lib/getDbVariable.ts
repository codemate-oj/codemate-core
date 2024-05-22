import { db, subscribe } from 'hydrooj';

interface DbVariableDoc<T> {
    docKey: string;
    __value: T;
}

declare module 'hydrooj' {
    interface Collections {
        kv: DbVariableDoc<any>;
    }

    interface EventMap {
        'dbVar/change': (docKey: string) => void;
    }
}
const coll = db.collection('kv');

export class DbVariable<T> {
    private readonly docKey: string;

    constructor(__value: T, docKey: string) {
        this._value = __value;
        this.docKey = docKey;
    }

    private _value: T;

    get value() {
        return this._value;
    }

    set value(newVal: T) {
        this._value = newVal;
        coll.findOneAndUpdate(
            { docKey: this.docKey },
            {
                $set: {
                    docKey: this.docKey,
                    __value: newVal,
                },
            },
            { upsert: true },
        ).then(() => {
            global.app.emit('dbVar/change', this.docKey);
        });
    }

    static async get<T>(docKey: string): Promise<T> {
        return (await coll.findOne({ docKey })).__value;
    }

    static async set<T>(docKey: string, value: T) {
        await coll.findOneAndUpdate(
            { docKey },
            {
                $set: {
                    docKey,
                    __value: value,
                },
            },
            { upsert: true },
        );
        global.app.emit('dbVar/change', docKey);
    }

    @subscribe('dbVar/change')
    async onChange(docKey: string) {
        if (docKey !== this.docKey) return;
        this._value = (await coll.findOne({ docKey })) as T;
    }
}

/**
 * Get a reactive variable, use as ref() in vue.
 * @param docKey {string} A key to identify the variable, should be unique.
 * @example
 * const foo = await getDbVariable('foo');
 * foo.value = 'bar';
 * foo.value; // 'bar'
 */
export async function getDbVariable<T extends object>(docKey: string): Promise<DbVariable<T>> {
    return new DbVariable<T>((await coll.findOne({ docKey })).__value as T, docKey);
}
