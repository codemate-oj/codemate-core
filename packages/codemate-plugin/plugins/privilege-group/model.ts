import { db, GDoc, ObjectId } from 'hydrooj';
import { ActivationCodeExpiredError, ActivationCodeNotFoundError, ActivationCodeUsedError, DuplicatedActivationError, GroupNotFoundError } from './lib';

export const collGroup = db.collection('user.group');

export interface ActivationCode {
    code: string; // 对应字段：激活码
    owner?: string; // 对应字段：机构名称
    createdAt?: Date; // 对应字段：创建时间
    expiredAt: Date; // 对应字段：过期时间
    remaining: number; // 对应字段：剩余次数
}

declare module 'hydrooj' {
    interface GDoc {
        parent?: ObjectId;
        children?: ObjectId[];
        activation?: ActivationCode[];
    }
    interface Model {
        group: GroupModel;
    }
}

export class GroupModel {
    static coll = collGroup;
    /**
     * 添加一个新的组，支持挂载到指定的父节点下
     * @param domainId 默认域参数
     * @param name 组名
     * @param parent （可选）父节点
     * @returns MongoDB操作结果
     */
    static async add(domainId: string, name: string, parent?: ObjectId) {
        // add a group, if parent set, will automatically change its parent
        const gdoc: GDoc = {
            _id: new ObjectId(),
            domainId,
            name,
            uids: [],
            parent,
        };
        if (parent) {
            await this.coll.updateOne({ _id: parent }, { $push: { children: gdoc._id } });
        }
        return await this.coll.insertOne(gdoc);
    }

    /**
     * 删除指定名称的组
     * @param domainId 默认域参数
     * @param name 组名
     * @returns MongoDB操作结果
     */
    static async del(domainId: string, name: string) {
        const gdoc = await this.coll.findOne({ domainId, name });
        if (!gdoc) throw new GroupNotFoundError(name);
        await Promise.all((gdoc.children || []).map((child) => this.coll.updateOne({ _id: child }, { $unset: { parent: 1 } })));
        if (gdoc.parent) await this.coll.updateOne({ _id: gdoc.parent }, { $pull: { children: gdoc._id } });
        await app.parallel('user/delcache', domainId);
        return await this.coll.deleteOne({ domainId, name });
    }

    /**
     * 检查用户是否具有对应组的权限（若用户具有其父节点的权限则拥有整棵树的权限）
     * @param domainId 默认域参数
     * @param uid 要检验的用户ID
     * @param name 要检验的组名
     * @returns 用户是否具有对应组的权限
     */
    static async has(domainId: string, uid: number, name: string) {
        // check if a user has a group
        let gdoc = await this.coll.findOne({ domainId, name });
        if (!gdoc) throw new GroupNotFoundError(name);
        while (gdoc && !gdoc.uids.includes(uid) && gdoc.parent) {
            // eslint-disable-next-line no-await-in-loop
            gdoc = await this.coll.findOne({ _id: gdoc.parent });
        }
        return gdoc && gdoc.uids.includes(uid);
    }

    /**
     * 根据组名获取组
     * @param domainId 默认域参数
     * @param name 组名
     * @returns 对应小组
     */
    static async get(domainId: string, name: string) {
        return await this.coll.findOne({ domainId, name });
    }

    /**
     * 获取所有组的列表（或某个用户的组）
     * @param domainId 默认域参数
     * @param uid （可选）用户ID，如果没有就获取所有组
     * @returns 组列表
     */
    static async list(domainId: string, uid?: number) {
        const groups = await this.coll.find(typeof uid === 'number' ? { domainId, uids: uid } : { domainId }).toArray();
        if (uid) {
            groups.push({
                _id: new ObjectId(),
                domainId,
                uids: [uid],
                name: uid.toString(),
            });
        }
        return groups;
    }

    /**
     * 更新或添加指定组
     * @param domainId 默认域参数
     * @param name 要更新的组名（如果没有则创建）
     * @param uids 要更新的uid
     * @param parent （可选）要更新的parent
     * @returns MongoDB操作结果
     */
    static async insertOrUpdate(domainId: string, name: string, uids: number[], parent?: ObjectId): ReturnType<(typeof collGroup)['updateOne']> {
        const gdoc = await this.coll.findOne({ domainId, name });
        if (!gdoc) {
            await this.add(domainId, name, parent);
            return await this.insertOrUpdate(domainId, name, uids, parent);
        }
        if (parent) {
            await this.coll.updateOne({ _id: parent }, { $addToSet: { children: gdoc._id } });
        }
        return await this.coll.updateOne({ _id: gdoc._id }, { $set: { uids, parent } });
    }

    static async activate(domainId: string, code: string, uid: number) {
        const groups = await this.coll.find({ domainId, activation: { $elemMatch: { code } } }).toArray();
        if (!groups.length) throw new ActivationCodeNotFoundError(code);

        const group = groups[0];
        if (group.uids.includes(uid)) throw new DuplicatedActivationError(group.name);
        const codeObj = group.activation.find((i) => i.code === code);
        if (!codeObj) throw new ActivationCodeNotFoundError(code);
        if (codeObj.expiredAt < new Date()) throw new ActivationCodeExpiredError(code, codeObj.expiredAt);
        if (codeObj.remaining <= 0) throw new ActivationCodeUsedError(code);

        const _act = group.activation.map((i) => {
            if (i.code !== code) return i;
            return { ...i, remaining: i.remaining - 1 };
        });
        await this.coll.updateOne({ _id: group._id }, { $addToSet: { uids: uid }, $set: { activation: _act } });
        return group;
    }

    static async setActivationCodes(gid: ObjectId, codes: ActivationCode[]) {
        return this.coll.updateOne({ _id: gid }, { $set: { activation: codes } });
    }
}
