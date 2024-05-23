import { Context, db, Service } from 'hydrooj';

const collKv = db.collection('kv');

interface KVData<T = any> {
    _id: string;
    value: T;
}

declare module 'hydrooj' {
    interface Collections {
        kv: KVData;
    }

    interface EventMap {
        'kv/change': (docKey: string, value: any) => void;
    }

    interface Context {
        kv: KVService;
    }
}

export interface KVTypes {
    [key: string]: any;
}

export class KVService extends Service {
    constructor(ctx: Context) {
        super(ctx, 'kv', true);
    }

    async get<K extends keyof KVTypes & string>(key: K): Promise<KVTypes[K] | null> {
        return (await collKv.findOne({ _id: key }))?.value ?? null;
    }

    async set<K extends keyof KVTypes & string>(key: K, value: KVTypes[K]) {
        const result = await collKv.updateOne({ _id: key }, { $set: { value } }, { upsert: true });
        global.app.emit('kv/change', key, value);
        return result;
    }

    /**
     * 从KV服务中获取指定键关联的值，并将其包装在Proxy对象中返回。
     * Proxy对象会监听值的变化，并相应地更新包装的值。
     *
     * @param {string} key - 要获取值的键。
     * @return {Promise<{ value: KVTypes[K] }>} 一个Promise，解析为包装获取到的值的Proxy对象。
     */
    async use<K extends keyof KVTypes & string>(key: K): Promise<{ value: KVTypes[K] } | null> {
        const _value = await this.get(key);
        const obj = { value: _value };
        // 订阅kv变化
        global.app.on('kv/change', (docKey, value) => {
            if (docKey === key) obj.value = value;
        });
        const that = this;
        return new Proxy<{ value: KVTypes[K] }>(obj, {
            set(target, prop, value) {
                if (prop !== 'value') return false;
                that.set(key, value)
                    .then(() => {
                        target.value = value;
                    })
                    .catch((e) => {
                        console.error(e);
                    });
                return true;
            },
        });
    }
}

export const apply = (ctx: Context) => {
    ctx.plugin(KVService);
};
