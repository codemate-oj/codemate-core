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
 * 获取一个对象，对这个对象的修改将会被自动保存到数据库中。如果先前使用过相同的字段标识，则会恢复之前的记录。这是一个 K-V 存储。
 * @example
 * const obj = await useDbVariable('test');
 * obj.foo = 'bar'; // 将会自动保存到数据库
 *
 * @param {string} docKey - 用于唯一标识对象的字段。
 * @returns {Promise<T>} - 返回一个代理对象，其属性可以被设置，设置后的值会同步到数据库中。
 */
export async function getDbVariable<T extends object>(docKey: string): Promise<DbVariable<T>> {
    return new DbVariable<T>((await coll.findOne({ docKey })).__value as T, docKey);
}
