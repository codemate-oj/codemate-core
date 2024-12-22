import { ContestModel, db, DocumentModel, Err, NotFoundError, ObjectId } from 'hydrooj';

export const HomeworkNotFoundError = Err('HomeworkNotFoundError', NotFoundError, 'Homework {0} not found.');

const collUser = db.collection('user');
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

    static getUserOptions(uids: number[], unames: string[]) {
        return collUser.find(
            { $or: [{ _id: { $in: uids } }, { uname: { $in: unames } }] },
            { projection: { _id: 1, uname: 1, avatar: 1, nickname: 1 } },
        );
    }

    static getProblemOptions(domainId: string, pids: number[], pidsAlias: string[]) {
        return collDoc.find(
            { $or: [{ docId: { $in: pids } }, { pid: { $in: pidsAlias } }], domainId, docType: DocumentModel.TYPE_PROBLEM },
            { projection: { _id: 0, docId: 1, pid: 1, title: 1 } },
        );
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
    static listMaintainHomeworksAggr(domainId: string, maintainerUid: number, filters: Record<string, any> = {}) {
        return this.getHomeworkAggr(domainId, ['assignGroup', 'attendUsers'], {
            ...filters,
            maintainerUid,
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
        if (typeof filters.maintainerUid === 'number') {
            firstMatch['$or'] = [{ maintainer: filters.maintainerUid }, { owner: filters.maintainerUid }];
        }
        // 相关的作业 id
        if (typeof filters.homeworkId === 'object') {
            firstMatch['_id'] = filters.homeworkId;
        }
        // 相关的授权用户组
        if (Array.isArray(filters.assign)) {
            firstMatch['assign'] = { $in: filters.assign };
        } else {
            firstMatch['assign'] = { $gt: [] };
        }
        // 第一次匹配缩小集合范围
        stages.push({ $match: firstMatch });

        const fieldsSet = new Set(fields);
        // 处理中间数据依赖
        if (['groupBy', 'groupByUser', 'groupByProblem', 'groupByHomework'].some((v) => fieldsSet.has(v))) {
            fieldsSet.add('statAttendUserProblem');
            fieldsSet.add('groupBy');
        }
        if (fieldsSet.has('statAttendUserProblem')) {
            fieldsSet.add('attendUsers');
            fieldsSet.add('attendProblem');
        }
        if (fieldsSet.has('attendProblem')) {
            fieldsSet.add('attendProblems');
        }
        if (fieldsSet.has('attendUsers')) {
            fieldsSet.add('assignGroup');
        }
        if (fieldsSet.has('statProblem')) {
            fieldsSet.add('assignGroup');
            fieldsSet.add('assignProblems');
        }

        // 关联作业的授权用户组
        if (fieldsSet.has('assignGroup')) {
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
                                        {
                                            $eq: ['$domainId', domainId],
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                    as: 'assignGroup',
                },
            });
            // 作业没有授权指定用户组不参与统计
            // stages.push({
            //     $match: {
            //         assignGroup: {
            //             $gt: [{ $size: '$assignGroup' }, 0],
            //         },
            //     },
            // });
        }

        // 关联作业的相关题目信息
        if (fieldsSet.has('assignProblems')) {
            stages.push({
                $lookup: {
                    from: 'document',
                    let: {
                        curPids: '$pids',
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $in: ['$docId', '$$curPids'],
                                        },
                                        {
                                            $eq: ['$docType', DocumentModel.TYPE_PROBLEM],
                                        },
                                        {
                                            $eq: ['$domainId', domainId],
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                    as: 'assignProblems',
                },
            });
            // 作业没有授权题目不参与统计
            // stages.push({
            //     $match: {
            //         assignProblems: {
            //             $gt: [{ $size: '$assignProblems' }, 0],
            //         },
            //     },
            // });
        }

        // 以作业分配的题目维度进行统计
        if (fieldsSet.has('statProblem')) {
            stages.push({
                $addFields: {
                    assignProblem: '$assignProblems',
                },
            });
            // stages.push({ $unwind: '$assignProblem' });
            stages.push({
                $unwind: {
                    path: '$assignProblem',
                    preserveNullAndEmptyArrays: true,
                },
            });
        }

        // 用户的实时参加作业信息
        if (fieldsSet.has('attendUsers')) {
            stages.push({
                $addFields: {
                    // 作业分配的用户组所包含的所有成员用户 uids
                    assignGroupUids: {
                        $reduce: {
                            input: { $ifNull: ['$assignGroup.uids', []] },
                            initialValue: [],
                            in: { $setUnion: [{ $ifNull: ['$$value', []] }, '$$this'] },
                        },
                    },
                },
            });

            // basic index domainId,docType,docId,uid
            const $and = [
                {
                    $eq: ['$domainId', domainId],
                },
                {
                    $eq: ['$docType', DocumentModel.TYPE_CONTEST],
                },
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
            // 指定 uid
            if (typeof filters.uid === 'number' && filters.uid) {
                $and.push({
                    $eq: ['$uid', '$$curUid'],
                });
            }
            stages.push({
                $lookup: {
                    from: 'document.status',
                    let: {
                        curHomeworkId: '$_id',
                        curGroupUids: '$assignGroupUids',
                        curAttend: filters.attend,
                        curUid: filters.uid,
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
                    // 当前实际参加作业的 uids，适配作业分配给指定用户组中部分的成员
                    attendUids: '$attendUsers.uid',
                },
            });
        }

        // 以参加作业的用户维度进行统计
        if (fieldsSet.has('statAttendUser')) {
            stages.push({
                $addFields: {
                    attendUserStatus: '$attendUsers',
                },
            });
            stages.push({
                $unwind: {
                    path: '$attendUserStatus',
                    preserveNullAndEmptyArrays: false,
                },
            });
            stages.push({
                $addFields: {
                    uid: '$attendUserStatus.uid',
                    // 提交的作业题目中存在超时提交的
                    isTimeout: {
                        $gt: [
                            {
                                $size: {
                                    $filter: {
                                        input: { $ifNull: ['$attendUserStatus.journal', []] },
                                        as: 'item',
                                        limit: 1,
                                        cond: {
                                            $lt: [
                                                '$penaltySince',
                                                {
                                                    $add: [
                                                        '$beginAt',
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
                    },
                },
            });
            // 以参加作业的用户及题目维度进行统计
        } else if (fieldsSet.has('statAttendUserProblem')) {
            stages.push({
                $addFields: {
                    attendUserStatus: '$attendUsers',
                    attendUserProblem: '$assignProblem',
                },
            });

            // 增加用户维度
            stages.push({
                $unwind: {
                    path: '$attendUserStatus',
                    preserveNullAndEmptyArrays: false,
                },
            });
            stages.push({
                $addFields: {
                    // 用户提交评测的题目状态集合 document.status
                    journalProblems: { $ifNull: ['$attendUserStatus.journal', []] },
                },
            });
            stages.push({
                $addFields: {
                    // 该用户已提交的评测题目 pids
                    journalPids: {
                        $map: {
                            input: '$journalProblems',
                            as: 'item',
                            in: '$$item.pid',
                        },
                    },
                    // 该用户的整体作业题目是否都提交过
                    isFinishAll: {
                        $setIsSubset: ['$pids', { $ifNull: ['$journalProblems.pid', []] }],
                    },
                },
            });

            // 增加题目维度
            stages.push({
                $unwind: {
                    path: '$attendUserProblem',
                    preserveNullAndEmptyArrays: false,
                },
            });
            stages.push({
                $addFields: {
                    // 该题目的最新评测记录
                    attendUserProblemStatus: {
                        $ifNull: [
                            {
                                $arrayElemAt: [
                                    {
                                        $filter: {
                                            input: '$journalProblems',
                                            as: 'item',
                                            cond: {
                                                $eq: ['$$item.pid', '$attendUserProblem.docId'],
                                            },
                                        },
                                    },
                                    -1,
                                ],
                            },
                            null,
                        ],
                    },
                },
            });
            stages.push({
                $addFields: {
                    uid: '$attendUserStatus.uid',
                    pid: '$attendUserProblem.docId',
                    pidAlias: '$attendUserProblem.pid',
                    // 该题目已提交过
                    isFinish: {
                        $not: {
                            $eq: ['$attendUserProblemStatus', null],
                        },
                    },
                    // 该题的评测状态
                    finishStatus: '$attendUserProblemStatus.status',
                    // 该题是超出作业限定时间提交
                    finishTimeout: {
                        $lt: [
                            '$penaltySince',
                            {
                                $add: [
                                    '$beginAt',
                                    {
                                        $multiply: ['$attendUserProblemStatus.time', 1000],
                                    },
                                ],
                            },
                        ],
                    },
                },
            });
        }

        // 根据用户分组统计题目数量
        // 适配场景： 老师查看作业下学生的刷题统计，或学生查看自己的做题统计
        // 1.指定作业下的所有学生的完成情况统计
        // 2.指定作业下的指定学生的完成情况统计
        // 3.所有作业下的所有学生的完成情况统计
        // 4.所有作业下的指定学生的完成情况统计

        // 根据题目分组统计用户数量
        // 适配场景： 老师查看作业下题目的被刷题统计，或学生查看自己的题目已提交情况
        // 1.指定作业下的所有题目的被完成情况统计
        // 2.指定作业下的特定题目的被完成情况统计
        // 3.所有作业下的所有题目的被完成情况统计
        // 4.所有作业下的指定题目的被完成情况统计
        if (fieldsSet.has('groupBy')) {
            // 通过上面 unwind 后，数据记录更改类似为 homeworkId,uid,pid 组成唯一索引
            const $group = {
                _id: {
                    domainId,
                },
                count: { $sum: 1 },
                pids: {
                    $addToSet: '$pid',
                },
                uids: {
                    $addToSet: '$uid',
                },
                homeworkId: {
                    $addToSet: '$_id',
                },
                submitProblemCount: {
                    $sum: {
                        $cond: {
                            if: '$isFinish',
                            then: 1,
                            else: 0,
                        },
                    },
                },
                finishHomeworkCount: {
                    $sum: {
                        $cond: {
                            if: '$isFinishAll',
                            then: 1,
                            else: 0,
                        },
                    },
                },
                finishProblemTimeout: {
                    $sum: {
                        $cond: {
                            if: '$finishTimeout',
                            then: 1,
                            else: 0,
                        },
                    },
                },
                acProblemCount: {
                    $sum: {
                        $cond: {
                            if: {
                                $eq: ['$finishStatus', 1],
                            },
                            then: 1,
                            else: 0,
                        },
                    },
                },
            };
            if (fieldsSet.has('groupByHomework')) {
                $group._id['homeworkId'] = '$_id';
            }
            if (fieldsSet.has('groupByUser')) {
                $group._id['uid'] = '$uid';
            }
            if (fieldsSet.has('groupByProblem')) {
                $group._id['pid'] = '$pid';
                $group['problem'] = {
                    $first: {
                        pid: '$assignProblem.pid',
                        title: '$assignProblem.title',
                        tag: '$assignProblem.tag',
                        difficulty: '$assignProblem.difficulty',
                        pids: '$pids',
                    },
                };
            }
            stages.push({
                $group,
            });

            // 分组后的 pid 是随机无序的，将其恢复成作业中 pids 一致的顺序
            if ($group._id['pid']) {
                stages.push({
                    $addFields: {
                        sortIndex: { $indexOfArray: ['$problem.pids', '$_id.pid'] },
                    },
                });
                stages.push({
                    $sort: { sortIndex: 1, 'problem.pid': 1 },
                });
                stages.push({
                    $project: {
                        sortIndex: 0,
                        'problem.pids': 0,
                    },
                });
            }
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
