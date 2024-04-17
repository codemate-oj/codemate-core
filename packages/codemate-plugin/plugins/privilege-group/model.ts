import { db, GDoc, ObjectId } from 'hydrooj';
import { GroupNotFoundError } from './lib';

export const collGroup = db.collection('user.group');

declare module 'hydrooj' {
    interface GDoc {
        parent?: ObjectId,
        children?: ObjectId[],
        activation?: { code: string, remaining: number }[],
    }
    interface Model {
        group: GroupModel;
    }
}

export class GroupModel {
    static coll = collGroup;
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

    static async del(domainId: string, name: string) {
        const gdoc = await this.coll.findOne({ domainId, name });
        if (!gdoc) throw new GroupNotFoundError();
        await Promise.all((gdoc.children || []).map((child) => this.coll.updateOne({ _id: child }, { $unset: { parent: 1 } })));
        if (gdoc.parent) await this.coll.updateOne({ _id: gdoc.parent }, { $pull: { children: gdoc._id } });
        await app.parallel('user/delcache', domainId);
        return await this.coll.deleteOne({ domainId, name });
    }

    static async has(domainId: string, uid: number, name: string) {
        // check if a user has a group
        let gdoc = await this.coll.findOne({ domainId, name });
        if (!gdoc) throw new GroupNotFoundError();
        while (gdoc && !gdoc.uids.includes(uid) && gdoc.parent) {
            // eslint-disable-next-line no-await-in-loop
            gdoc = await this.coll.findOne({ _id: gdoc.parent });
        }
        return gdoc && gdoc.uids.includes(uid);
    }

    static async get(domainId: string, name: string) {
        return await this.coll.findOne({ domainId, name });
    }

    static async list(domainId: string, uid?: number) {
        const groups = await this.coll.find(typeof uid === 'number' ? { domainId, uids: uid } : { domainId }).toArray();
        if (uid) {
            groups.push({
                _id: new ObjectId(), domainId, uids: [uid], name: uid.toString(),
            });
        }
        return groups;
    }

    static async update(domainId: string, name: string, uids: number[], parent?: ObjectId): ReturnType<typeof collGroup['updateOne']> {
        const gdoc = await this.coll.findOne({ domainId, name });
        if (!gdoc) {
            await this.add(domainId, name, parent);
            return await this.update(domainId, name, uids, parent);
        }
        if (parent) {
            await this.coll.updateOne({ _id: parent }, { $addToSet: { children: gdoc._id } });
        }
        return await this.coll.updateOne({ _id: gdoc._id }, { $set: { uids, parent } });
    }
}
