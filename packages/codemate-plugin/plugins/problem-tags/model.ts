import { db, ObjectId } from 'hydrooj';

export const collTag = db.collection('categoryChapter');
export const collDoc = db.collection('document');

declare module 'hydrooj' {
    interface Collections {
        categoryChapter: ProblemTagsModel;
    }
    interface ProblemTagsModel {
        category: string;
        chapter: string;
        type: string;
        subject: string;
        level: number; // 难度级别
        reference: string; // 参考难度的体系
        createdAt?: Date;
        updatedAt?: Date;
    }
    interface Model {
        problemTags: ProblemTagsModel;
    }
}

export class ProblemTagsModel {
    static coll = collTag;

    static get(_id: ObjectId) {
        return this.coll.findOne({ _id });
    }

    static list() {
        return this.coll.find({});
    }

    static getCategoryTags() {
        return this.coll.aggregate([
            {
                $group: {
                    _id: {
                        category: '$category',
                    },
                    tags: {
                        $addToSet: '$chapter',
                    },
                },
            },
            {
                $project: {
                    _id: 0,
                    category: '$_id.category',
                    tags: '$tags',
                },
            },
        ]);
    }

    static getTagStat() {
        return collDoc.aggregate([
            {
                $project: {
                    // pid: 1,
                    tag: 1,
                    docId: 1,
                },
            },
            {
                $unwind: {
                    path: '$tag',
                    preserveNullAndEmptyArrays: false,
                },
            },
            {
                $group: {
                    _id: {
                        tag: '$tag',
                    },
                    count: {
                        $sum: 1,
                    },
                },
            },
            {
                $project: {
                    _id: 0,
                    tag: '$_id.tag',
                    count: '$count',
                },
            },
            {
                $sort: { count: -1 },
            },
        ]);
    }
}
