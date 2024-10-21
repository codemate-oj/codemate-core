import { db, GDoc, ObjectId, UserModel } from 'hydrooj';
import { GroupNotFoundError } from '../privilege-group/lib';

export const collGroup = db.collection('user.group');

declare module 'hydrooj' {
    interface GDoc {
        alias?: string;
        owner?: string | number;
        parent?: ObjectId;
        children?: ObjectId[];
        activation?: string[]; // 激活码存放在token coll中，这里是token._id
        createdAt?: Date;
        updatedAt?: Date;
    }
    interface Model {
        group: UserGroupModel;
    }
}

export class UserGroupModel {
    static coll = collGroup;
    /**
     * 添加一个新的组，支持挂载到指定的父节点下
     * @param fields 字段信息字典
     * @returns 新增记录的 _id
     */
    static async add(fields: Record<string, any>) {
        const currentDate = new Date();
        const result = await this.coll.insertOne({
            ...fields,
            // 不需要用户去设置唯一标识，而是让用户自定义别名提高可读性
            createdAt: currentDate,
            updatedAt: currentDate,
            name: new ObjectId().toString(),
        } as GDoc);
        if (fields.parent) {
            await this.coll.updateOne({ _id: fields.parent }, { $push: { children: result.insertedId }, $set: { updatedAt: currentDate } });
        }
        return result.insertedId;
    }

    /**
     * 删除指定名称的组
     * @param domainId 默认域参数
     * @param fields 字段信息字典
     * @returns MongoDB操作结果
     */
    static async del(fields: Record<string, any>) {
        const currentDate = new Date();
        const gdoc = await this.coll.findOne(fields);
        if (!gdoc || !fields._id) return 0;
        await Promise.all(
            (gdoc.children || []).map((child) => this.coll.updateOne({ _id: child }, { $unset: { parent: 1 }, $set: { updatedAt: currentDate } })),
        );
        if (gdoc.parent) await this.coll.updateOne({ _id: gdoc.parent }, { $pull: { children: gdoc._id }, $set: { updatedAt: currentDate } });
        return (await this.coll.deleteOne({ _id: gdoc._id })).deletedCount;
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
    static getByName(domainId: string, name: string) {
        return this.coll.findOne({ domainId, name });
    }

    static get(domainId: string, _id: ObjectId) {
        return this.coll.findOne({ domainId, _id });
    }

    /**
     * 获取指定用户的所有组，创建者,维护者或者是组员
     * 场景：老师查看其创建的所有小组，老师自己本身可能也是一个组员
     * @param domainId 默认域参数
     * @param uid 用户ID
     * @returns cursor
     */
    static list(domainId: string, uid: number) {
        return this.coll.find({ domainId, $or: [{ uids: uid }, { owner: uid }] });
    }

    /**
     * 获取指定用户参加的所有组
     * @param domainId 默认域参数
     * @param uid 用户ID
     * @returns cursor
     */
    static listAttend(domainId: string, uid: number) {
        return this.coll.find({ domainId, uids: uid });
    }

    /**
     * 获取指定用户维护的所有组
     * @param domainId 默认域参数
     * @param uid 用户ID
     * @returns cursor
     */
    static listMaintain(domainId: string, uid: number) {
        return this.coll.find({ domainId, owner: uid });
    }

    /**
     * 获取指定成员信息列表
     * @param uids 成员 ID
     * @returns cursor
     */
    static listMembers(uids: number[]) {
        return UserModel.coll.find(
            {
                _id: {
                    $in: uids,
                },
            },
            { projection: { _id: 1, uname: 1, avatar: 1, nickname: 1 } },
        );
    }

    static listMembersByName(unames: string[]) {
        return UserModel.coll.find(
            {
                uname: {
                    $in: unames,
                },
            },
            { projection: { _id: 1, uname: 1, avatar: 1, nickname: 1 } },
        );
    }

    static async removeMembers(_id: ObjectId, uids: number[]) {
        const currentDate = new Date();
        return await this.coll.updateOne(
            { _id },
            {
                $set: {
                    updatedAt: currentDate,
                },
                $pull: { uids: { $in: uids } },
            },
        );
    }

    /**
     * 更新或添加指定组
     * @param fields 字段信息字典
     * @returns 新增 _id 或 更新记录计数
     */
    static async insertOrUpdate(fields: Record<string, any>) {
        const currentDate = new Date();
        const gdoc = await this.coll.findOne({
            _id: fields._id,
            owner: fields.owner,
        });
        if (!gdoc) {
            return await this.add(fields);
        }
        if (fields.parent) {
            await this.coll.updateOne({ _id: fields.parent }, { $addToSet: { children: gdoc._id }, $set: { updatedAt: currentDate } });
        }
        return (
            await this.coll.updateOne(
                { _id: gdoc._id },
                {
                    $set: {
                        ...fields,
                        updatedAt: currentDate,
                    },
                },
            )
        ).upsertedId;
    }
}
