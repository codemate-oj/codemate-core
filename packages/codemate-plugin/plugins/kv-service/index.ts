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
        'kv/change': <T extends any>(docKey: string, value: T) => void;
    }

    interface Context {
        kv: KVService;
    }
}

export class KVService extends Service {
    constructor(ctx: Context) {
        super(ctx, 'kv', true);
    }

    async get<T extends any>(key: string): Promise<T | null> {
        return ((await collKv.findOne({ _id: key }))?.value as T) ?? null;
    }

    async set<T extends any>(key: string, value: T) {
        const result = await collKv.updateOne({ _id: key }, { $set: { value } }, { upsert: true });
        global.app.emit('kv/change', key, value);
        return result;
    }

    /**
     * 从KV服务中获取指定键关联的值，并将其包装在Proxy对象中返回。
     * Proxy对象会监听值的变化，并相应地更新包装的值。
     *
     * @param {string} key - 要获取值的键。
     * @return {Promise<Proxy<{ value: T }>>} 一个Promise，解析为包装获取到的值的Proxy对象。
     */
    async use<T extends any>(key: string) {
        const _value = await this.get<T>(key);
        const obj = { value: _value };
        // 订阅kv变化
        global.app.on('kv/change', (docKey, value: any) => {
            if (docKey === key) obj.value = value;
        });
        const that = this;
        return new Proxy<{ value: T }>(obj, {
            set(target, prop, value) {
                if (prop === 'value') {
                    that.set(key, value)
                        .then(() => {
                            target.value = value;
                        })
                        .catch((e) => {
                            console.error(e);
                        });
                } else {
                    target[prop] = value;
                }
                return value;
            },
        });
    }
}

export const apply = (ctx: Context) => {
    ctx.plugin(KVService);
};
