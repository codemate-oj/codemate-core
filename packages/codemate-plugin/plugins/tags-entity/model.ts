import { Document, DocumentModel, ObjectId, Projection } from 'hydrooj';

type stringDict = { [p: string]: string };

export interface TagDoc extends Document {
    name: stringDict;
    alias: string[];
    description: stringDict;
}

export default class TagModel {
    static async add(domainId: string, name: stringDict, alias: string[], description: stringDict): Promise<ObjectId> {
        return await DocumentModel.add(domainId, '', 1, DocumentModel.TYPE_TAGS, null, null, null, {
            name,
            alias,
            description,
        });
    }

    static async del(domainId: string, docId: ObjectId) {
        await DocumentModel.deleteOne(domainId, DocumentModel.TYPE_TAGS, docId);
    }

    static async edit(domainId: string, docId: ObjectId, name: stringDict, alias: string[], description: stringDict) {
        await DocumentModel.set(domainId, DocumentModel.TYPE_TAGS, docId, {
            name,
            alias,
            description,
        });
    }

    static async get(domainId: string, docId: ObjectId) {
        return await DocumentModel.get(domainId, DocumentModel.TYPE_TAGS, docId);
    }

    static async getMulti(domainId: string, query?: Partial<TagDoc>, projection?: Projection<TagDoc>) {
        return DocumentModel.getMulti(domainId, DocumentModel.TYPE_TAGS, query, projection);
    }
}
