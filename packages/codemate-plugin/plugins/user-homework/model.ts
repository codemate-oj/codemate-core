import { ContestModel, db, DocumentModel, Err, NotFoundError, ObjectId } from 'hydrooj';

export const HomeworkNotFoundError = Err('HomeworkNotFoundError', NotFoundError, 'Homework {0} not found.');

const collDoc = db.collection('document');
const collDocStatus = db.collection('document.status');

export class UserHomeworkModel {
    static document = DocumentModel;
    static contest = ContestModel;

    /**
     * 获取单个作业
     * @param domainId 默认域参数
     * @param homeworkId 作业对应的 ObjectId
     * @returns cursor findOne
     */
    static get(domainId: string, homeworkId: ObjectId) {
        return collDoc.findOne({ domainId, _id: homeworkId, docType: DocumentModel.TYPE_CONTEST, rule: 'homework' });
    }

    /**
     * 设置 document.status 中 attend 记录
     * @param domainId 默认域参数
     * @param homeworkId 作业对应的 ObjectId
     * @param uids 参加当前作业的所有 uids
     * @returns cursor findOne
     */
    static async setAllAttendUids(domainId: string, homeworkId: ObjectId, uids: number[]) {
        // 设置要参加该作业的所有成员
        await collDocStatus.bulkWrite(
            uids.map((uid) => ({
                updateOne: {
                    filter: { domainId, docId: homeworkId, docType: DocumentModel.TYPE_CONTEST, uid },
                    update: {
                        $set: {
                            attend: 1,
                        },
                        $setOnInsert: {
                            startAt: new Date(),
                        },
                    },
                    upsert: true,
                },
            })),
        );
        // 限制其他所有成员
        await collDocStatus.updateMany(
            { domainId, docId: homeworkId, docType: DocumentModel.TYPE_CONTEST, uid: { $nin: uids } },
            {
                $set: {
                    attend: 0,
                },
            },
        );

        await collDoc.findOneAndUpdate(
            { domainId, _id: homeworkId, docType: DocumentModel.TYPE_CONTEST, rule: 'homework' },
            {
                $set: {
                    attend: uids.length,
                },
            },
        );
    }

    /**
     * 设置作业的审核状态
     * @param domainId 默认域参数
     * @param homeworkId 作业对应的 ObjectId
     * @param isReviewed 是否已检查作业
     * @returns await updateOne
     */
    static async setReview(domainId: string, homeworkId: ObjectId, isReviewed: boolean) {
        const homeworkDoc = await this.get(domainId, homeworkId);
        if (!homeworkDoc) throw new HomeworkNotFoundError(homeworkId);
        return await collDoc.updateOne({ domainId, _id: homeworkId }, { $set: { isReviewed, reviewedAt: new Date() } });
    }

    /**
     * 设置作业的发布状态
     * @param domainId 默认域参数
     * @param homeworkId 作业对应的 ObjectId
     * @param isPublished 是否已发布作业
     * @returns await updateOne
     */
    static async setPublish(domainId: string, homeworkId: ObjectId, isPublished: boolean) {
        const homeworkDoc = await this.get(domainId, homeworkId);
        if (!homeworkDoc) throw new HomeworkNotFoundError(homeworkId);
        return await collDoc.updateOne({ domainId, _id: homeworkId }, { $set: { isPublished } });
    }

    /**
     * 查询作业下面挂载的题目
     * @param domainId 默认域参数
     * @param homeworkId 作业对应的 ObjectId
     * @returns cursor find
     */
    static async listProblems(domainId: string, homeworkId: ObjectId) {
        const homeworkDoc = await this.get(domainId, homeworkId);
        if (!homeworkDoc) throw new HomeworkNotFoundError(homeworkId);
        return collDoc.find(
            { domainId, docType: DocumentModel.TYPE_PROBLEM, approved: true, docId: { $in: homeworkDoc.pids } },
            { projection: { pid: 1, brief: 1, title: 1, tag: 1 } },
        );
    }

    /**
     * 查询参加作业的成员
     * @param domainId 默认域参数
     * @param homeworkId 作业对应的 ObjectId
     * @returns cursor find
     */
    static async listMembers(domainId: string, homeworkId: ObjectId) {
        const homeworkDoc = await this.get(domainId, homeworkId);
        if (!homeworkDoc) throw new HomeworkNotFoundError(homeworkId);
        return collDocStatus.find({ domainId, docId: homeworkId, docType: DocumentModel.TYPE_CONTEST, attend: 1 });
    }

    /**
     * 查询指定用户参加的作业
     * @param domainId 默认域参数
     * @param uid 用户的 uid
     * @returns cursor find
     */
    static async listAttendHomework(domainId: string, uid: number) {
        return collDocStatus.find({ domainId, uid, docType: DocumentModel.TYPE_CONTEST });
    }

    static getPageStages(filters: Record<string, any> = {}) {
        const stages = [];
        if (filters.page && filters.pageSize) {
            stages.push({
                $facet: {
                    count: [{ $count: 'count' }],
                    data: [{ $skip: (filters.page - 1) * filters.pageSize }, { $limit: filters.pageSize }],
                },
            });
            stages.push({ $unwind: '$count' });
            stages.push({ $addFields: { count: '$count.count', page: filters.page, pageSize: filters.pageSize } });
        }
        return stages;
    }

    /**
     * 查询指定用户管理的所有作业
     * @param domainId 默认域参数
     * @param uid 用户的 uid
     * @param filters 筛选条件
     * @returns cursor find
     */
    static listMaintainHomeworksAggr(domainId: string, uid: number, filters: Record<string, any> = {}) {
        return this.getHomeworkAggr(domainId, ['assignGroup', 'attendUsers'], {
            ...filters,
            uid,
        });
    }

    /**
     * 根据 docment status 进行聚合
     * @param domainId 默认域参数
     * @param fields 额外的返回字段
     * @param filters 筛选条件
     * @returns cursor aggregate
     */
    static async getHomeworkAggr(domainId: string, fields: string[] = [], filters: Record<string, any> = {}) {
        const stages = [];
        const firstMatch = { domainId, docType: DocumentModel.TYPE_CONTEST, rule: 'homework' };
        // 作业中的授权维护人员 id
        if (typeof filters.uid === 'number') {
            firstMatch['$or'] = [{ maintainer: filters.uid }, { owner: filters.uid }];
        }
        // 相关的作业 id
        if (typeof filters.homeworkId === 'object') {
            firstMatch['_id'] = filters.homeworkId;
        }
        // 第一次匹配缩小集合范围
        stages.push({ $match: firstMatch });

        // 作业的授权用户组
        if (fields.includes('assignGroup')) {
            stages.push({
                $lookup: {
                    from: 'user.group',
                    let: {
                        curGroupNames: '$assign',
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $in: ['$name', '$$curGroupNames'],
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                    as: 'assignGroup',
                },
            });
            stages.push({
                $match: {
                    assignGroup: {
                        $gt: [{ $size: '$assignGroup' }, 0],
                    },
                },
            });
        }

        // 用户的实时参加作业信息
        if (fields.includes('attendUsers')) {
            stages.push({
                $addFields: {
                    assignGroupUids: {
                        $reduce: {
                            input: '$assignGroup.uids',
                            initialValue: [],
                            in: { $setUnion: [{ $ifNull: ['$$value', []] }, '$$this'] },
                        },
                    },
                },
            });

            const $and = [
                {
                    $eq: ['$docId', '$$curHomeworkId'],
                },
                {
                    $in: ['$uid', '$$curGroupUids'],
                },
            ];
            // 参加状态 1 表示现在参加中 0 表示曾经加入过
            if (typeof filters.attend === 'number') {
                $and.push({
                    $eq: ['$attend', '$$curAttend'],
                });
            }
            stages.push({
                $lookup: {
                    from: 'document.status',
                    let: {
                        curHomeworkId: '$_id',
                        curGroupUids: '$assignGroupUids',
                        curAttend: filters.attend,
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and,
                                },
                            },
                        },
                    ],
                    as: 'attendUsers',
                },
            });
            stages.push({
                $addFields: {
                    attendUids: '$attendUsers.uids',
                },
            });
        }

        for (const s of this.getPageStages(filters)) {
            stages.push(s);
        }

        return collDoc.aggregate(stages);
    }

    /**
     * 查询指定用户参加的所有作业
     * @param domainId 默认域参数
     * @param uid 用户的 uid
     * @param filters 筛选条件
     * @returns cursor find
     */
    static listAttendHomeworksAggr(domainId: string, uid: number, filters: Record<string, any> = {}) {
        return this.getDocStatusAggr(domainId, ['assignGroup', 'homework', 'homeworkType', 'isFinishAll', 'isTimeout'], {
            ...filters,
            uid,
            attend: 1,
        });
    }

    /**
     * 查询指定作业的所有参加用户
     * @param domainId 默认域参数
     * @param uid 用户的 uid
     * @param filters 筛选条件
     * @returns cursor find
     */
    static listAttendUsersAggr(domainId: string, homeworkId: ObjectId, filters: Record<string, any> = {}) {
        return this.getDocStatusAggr(domainId, ['uname', 'isFinishAll', 'isTimeout'], {
            ...filters,
            homeworkId,
            attend: 1,
        });
    }

    /**
     * 根据 docment status 进行聚合
     * @param domainId 默认域参数
     * @param fields 额外的返回字段
     * @param filters 筛选条件
     * @returns cursor aggregate
     */
    static async getDocStatusAggr(domainId: string, fields: string[] = [], filters: Record<string, any> = {}) {
        const stages = [];

        const firstMatch = { domainId, docType: DocumentModel.TYPE_CONTEST };
        // 作业中的指定参与人员 id
        if (typeof filters.uid === 'number') {
            firstMatch['uid'] = filters.uid;
        }
        // 参与状态 1 表示出席 0 表示未出席
        if (typeof filters.attend === 'number') {
            firstMatch['attend'] = filters.attend;
        }
        // 相关的作业 id
        if (typeof filters.homeworkId === 'object') {
            firstMatch['docId'] = filters.homeworkId;
        }
        // 第一次匹配缩小集合范围
        stages.push({ $match: firstMatch });

        // 关联对应的作业 一对一
        stages.push({
            $lookup: {
                from: 'document',
                let: { rule: 'homework', homeworkId: '$docId' },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [{ $eq: ['$$homeworkId', '$_id'] }, { $eq: ['$$rule', '$rule'] }],
                            },
                        },
                    },
                ],
                as: 'homework',
            },
        });
        stages.push({ $unwind: '$homework' });

        stages.push({
            $addFields: {
                journal: { $ifNull: ['$journal', []] },
                // 所作业中包含的题目 id
                homeworkPids: '$homework.pids',
                // 已提交评测的题目，包括提交但评测不通过的题目 id
                journalPids: {
                    $map: {
                        input: '$journal',
                        as: 'item',
                        in: '$$item.pid',
                    },
                },
            },
        });
        stages.push({
            $addFields: {
                // 是否所有的题目都提交过了
                isFinishAll: {
                    $setIsSubset: ['$homeworkPids', { $ifNull: ['$journalPids', []] }],
                },
                // 该作业是否在生效的时间范围
                homeworkType: {
                    $cond: {
                        if: {
                            $gt: ['$homework.beginAt', new Date()],
                        },
                        then: '限时',
                        else: '常规',
                    },
                },
            },
        });

        // 根据作业是否完成进行过滤
        if (typeof filters.isFinishAll === 'boolean') {
            stages.push({
                $match: {
                    isFinishAll: filters.isFinishAll,
                },
            });
        }

        const $project = {
            isFinishAll: 1,
        };
        // 用户的相关基础信息
        if (fields.includes('uname')) {
            stages.push({ $lookup: { from: 'user', localField: 'uid', foreignField: '_id', as: 'user' } });
            stages.push({ $unwind: '$user' });

            $project['uname'] = '$user.uname';
            $project['uid'] = '$user._id';
            $project['nickname'] = '$user.nickname';
            $project['avatar'] = '$user.avatar';
        }
        // 作业的授权用户组
        if (fields.includes('assignGroup')) {
            stages.push({
                $lookup: {
                    from: 'user.group',
                    let: {
                        curGroupNames: '$homework.assign',
                        curUid: '$uid',
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $in: ['$name', '$$curGroupNames'],
                                        },
                                        {
                                            $in: ['$$curUid', '$uids'], // uids 必须是数组
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                    as: 'assignGroup',
                },
            });
            stages.push({
                $match: {
                    assignGroup: {
                        $gt: [{ $size: '$assignGroup' }, 0],
                    },
                },
            });

            $project['assignGroup'] = 1;
        }
        if (fields.includes('journal')) {
            $project['journal'] = 1;
        }
        if (fields.includes('homework')) {
            $project['homework'] = 1;
        }
        if (fields.includes('homeworkType')) {
            $project['homeworkType'] = 1;
        }
        if (fields.includes('homeworkId')) {
            $project['homeworkId'] = '$homework._id';
        }
        if (fields.includes('isTimeout')) {
            $project['isTimeout'] = {
                $gt: [
                    {
                        $size: {
                            $filter: {
                                input: '$journal',
                                as: 'item',
                                limit: 1,
                                cond: {
                                    $lt: [
                                        '$homework.penaltySince',
                                        {
                                            $add: [
                                                '$homework.beginAt',
                                                {
                                                    $multiply: ['$$item.time', 1000],
                                                },
                                            ],
                                        },
                                    ],
                                },
                            },
                        },
                    },
                    0,
                ],
            };
        }
        stages.push({
            $project,
        });

        for (const s of this.getPageStages(filters)) {
            stages.push(s);
        }

        return collDocStatus.aggregate(stages);
    }
}
