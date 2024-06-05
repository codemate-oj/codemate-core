import { DocumentModel, Filter, ObjectId } from 'hydrooj';

export interface BulletinDoc extends Document {
    docId: ObjectId;
    docType: typeof DocumentModel.TYPE_BULLETIN;
    title: string;
    content: string;
    tags: string[];
    postAt: number; // time stamp
    owner: number;
}

export class BulletinModel {
    static async add(domainId: string, owner: number, title: string, content: string, tags: string[]) {
        return await DocumentModel.add(domainId, content, owner, DocumentModel.TYPE_BULLETIN, null, null, null, {
            title,
            tags,
            postAt: Date.now(),
        });
    }

    static getMulti(domainId: string, query: Filter<BulletinDoc> = {}) {
        return DocumentModel.getMulti(domainId, DocumentModel.TYPE_BULLETIN, query);
    }

    static async get(domainId: string, docId: ObjectId): Promise<BulletinDoc> {
        return await DocumentModel.get(domainId, DocumentModel.TYPE_BULLETIN, docId);
    }

    static async del(domainId: string, docId: ObjectId) {
        return await DocumentModel.deleteOne(domainId, DocumentModel.TYPE_BULLETIN, docId);
    }

    static async edit(domainId: string, docId: ObjectId, $set: Partial<BulletinDoc>) {
        return await DocumentModel.set(domainId, DocumentModel.TYPE_BULLETIN, docId, $set);
    }
}
