import { Filter } from 'mongodb';
import { TokenDoc } from '../interface';
import * as bus from '../service/bus';
import db from '../service/db';
import { ArgMethod } from '../utils';

export interface ActivationCode extends TokenDoc {
    // 激活码为6位随机字符串，_id即为激活码
    owner?: string; // 对应字段：机构名称
    remaining: number; // 对应字段：剩余次数
}

class TokenModel {
    static coll = db.collection('token');
    static TYPE_SESSION = 0;
    static TYPE_REGISTRATION = 2;
    static TYPE_CHANGEMAIL = 3;
    static TYPE_OAUTH = 4;
    static TYPE_LOSTPASS = 5;
    static TYPE_EXPORT = 6;
    static TYPE_IMPORT = 7;
    static TYPE_WEBAUTHN = 8;
    static TYPE_ACTIVATION = 10; // 设置10是为了兼容老版本9被占用的情况
    static TYPE_TEXTS = {
        [TokenModel.TYPE_SESSION]: 'Session',
        [TokenModel.TYPE_REGISTRATION]: 'Registration',
        [TokenModel.TYPE_CHANGEMAIL]: 'Change Email',
        [TokenModel.TYPE_OAUTH]: 'OAuth',
        [TokenModel.TYPE_LOSTPASS]: 'Lost Password',
        [TokenModel.TYPE_EXPORT]: 'Export',
        [TokenModel.TYPE_IMPORT]: 'Import',
        [TokenModel.TYPE_WEBAUTHN]: 'WebAuthn',
        [TokenModel.TYPE_ACTIVATION]: 'Activation Code',
    };

    static async add(tokenType: number, expireSeconds: number, data: any, id = String.random(32)): Promise<[string, TokenDoc]> {
        const now = new Date();
        const payload = {
            ...data,
            _id: id,
            tokenType,
            createAt: now,
            updateAt: now,
            expireAt: new Date(now.getTime() + expireSeconds * 1000),
        };
        await TokenModel.coll.insertOne(payload);
        return [id, payload];
    }

    @ArgMethod
    static async get(tokenId: string, tokenType: number): Promise<TokenDoc | null> {
        return await TokenModel.coll.findOne({ _id: tokenId, tokenType });
    }

    static getMulti(tokenType: number, query: Filter<TokenDoc> = {}) {
        return TokenModel.coll.find({ tokenType, ...query });
    }

    static async update(tokenId: string, tokenType: number, expireSeconds: number, data: object) {
        const now = new Date();
        const res = await TokenModel.coll.findOneAndUpdate(
            { _id: tokenId, tokenType },
            {
                $set: {
                    ...data,
                    updateAt: now,
                    expireAt: new Date(now.getTime() + expireSeconds * 1000),
                    tokenType,
                },
            },
            { returnDocument: 'after' },
        );
        return res.value;
    }

    @ArgMethod
    static async del(tokenId: string, tokenType: number) {
        const result = await TokenModel.coll.deleteOne({ _id: tokenId, tokenType });
        return !!result.deletedCount;
    }

    static async createOrUpdate(tokenType: number, expireSeconds: number, data: any): Promise<string> {
        const d = await TokenModel.coll.findOne({ tokenType, ...data });
        if (!d) {
            const res = await TokenModel.add(tokenType, expireSeconds, data);
            return res[0];
        }
        await TokenModel.update(d._id, tokenType, expireSeconds, data);
        return d._id;
    }

    @ArgMethod
    static getSessionListByUid(uid: number) {
        return TokenModel.coll.find({ uid, tokenType: TokenModel.TYPE_SESSION }).sort('updateAt', -1).limit(100).toArray();
    }

    @ArgMethod
    static async getMostRecentSessionByUid(uid: number, projection: string[]) {
        return await TokenModel.coll.findOne(
            { uid, tokenType: TokenModel.TYPE_SESSION },
            { projection: { _id: 0, ...Object.fromEntries(projection.map((i) => [i, 1])) }, sort: { updateAt: -1 } },
        );
    }

    @ArgMethod
    static delByUid(uid: number) {
        return TokenModel.coll.deleteMany({ uid });
    }

    static async addActCode(expireAt: Date, times = 1, owner?: string, data: Record<string, any> = {}, num = 1) {
        const _docs: ActivationCode[] = [];
        for (let i = 0; i < num; i++) {
            let code = String.random(6);
            while (true) {
                // 保证激活码不重复（虽然对主键来说是重复判断）
                // eslint-disable-next-line no-await-in-loop
                const d = await TokenModel.coll.findOne({ tokenType: TokenModel.TYPE_ACTIVATION, _id: code });
                if (!d) break;
                code = String.random(6);
            }
            expireAt = typeof expireAt === 'string' ? new Date(expireAt) : expireAt;
            const expireSeconds = Math.round((expireAt.getTime() - new Date().getTime()) / 1000);
            // eslint-disable-next-line no-await-in-loop
            const [_, doc] = await this.add(TokenModel.TYPE_ACTIVATION, expireSeconds, { ...data, owner, remaining: times }, code);
            _docs.push(doc as ActivationCode);
        }
        return _docs;
    }

    static updateActCode(code: string, data: Partial<ActivationCode> = {}) {
        return this.coll.updateOne(
            {
                tokenType: TokenModel.TYPE_ACTIVATION,
                _id: code,
            },
            {
                $set: { ...data },
            },
        );
    }
}

bus.on('ready', () =>
    db.ensureIndexes(
        TokenModel.coll,
        { key: { uid: 1, tokenType: 1, updateAt: -1 }, name: 'basic', sparse: true },
        { key: { expireAt: -1 }, name: 'expire', expireAfterSeconds: 0 },
    ),
);
export default TokenModel;
global.Hydro.model.token = TokenModel;
