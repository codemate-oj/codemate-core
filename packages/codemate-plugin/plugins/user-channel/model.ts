import { ContestModel, db, DocumentModel, Err, nanoid, NotFoundError, ObjectId } from 'hydrooj';

export const ChannelNotFoundError = Err('ChannelNotFoundError', NotFoundError, 'Channel {0} not found.');

const collSubmit = db.collection('record');
const collOp = db.collection('oplog');
const collUser = db.collection('user');
const collDoc = db.collection('document');

export class ChannelModel {
    static document = DocumentModel;
    static contest = ContestModel;

    static async add(fields: Record<string, any>) {
        const currentDate = new Date();
        const docId = nanoid(8);
        const result = await collDoc.insertOne({
            contend: docId,
            ...fields,
            // 不需要用户去设置唯一标识，而是让用户自定义别名提高可读性
            createdAt: currentDate,
            updatedAt: currentDate,
            docType: DocumentModel.TYPE_INVITATION,
            users: [],
            docId,
        });
        return result.insertedId;
    }

    static async edit(_id: ObjectId, fields: Record<string, any>) {
        const result = await collDoc.updateOne(
            { _id },
            {
                $set: {
                    ...fields,
                    updatedAt: new Date(),
                },
            },
        );
        return result.upsertedId;
    }

    /**
     * 获取单个渠道信息
     * @param domainId 默认域参数
     * @param _id 渠道对应的 ObjectId
     * @returns cursor findOne
     */
    static get(domainId: string, _id: ObjectId) {
        return this.getByFilters(domainId, { _id });
    }

    static getByCode(domainId: string, code: string) {
        return this.getByFilters(domainId, { docId: code });
    }

    static getByAlias(domainId: string, linkAlias: number) {
        return this.getByFilters(domainId, { linkAlias });
    }

    static getByFilters(domainId: string, filters: Record<string, any>) {
        // return collDoc.findOne({ domainId, docType: DocumentModel.TYPE_INVITATION, ...filters }, { projection: { users: 0 } });
        return collDoc.findOne({ domainId, docType: DocumentModel.TYPE_INVITATION, ...filters });
    }

    static listAll(domainId: string, filters: Record<string, any> = {}) {
        return collDoc.find({ domainId, docType: DocumentModel.TYPE_INVITATION, ...filters });
    }

    /**
     * 查询指定邀请码的所有注册用户
     * @param domainId 默认域参数
     * @param inviteCode 用户注册时使用的邀请码
     * @returns cursor find
     */
    static listUsersByCode(inviteCode: string) {
        return this.listUsersByFilter({ inviteCode });
    }

    static listUsersByDate(beginAt: Date, endAt: Date) {
        return this.listUsersByFilter({ regat: { $gte: beginAt, $lt: endAt } });
    }

    static listUsersByFilter(filters: Record<string, any>) {
        return collUser.find({ ...filters }, { projection: { _id: 1, uname: 1, avatar: 1, nickname: 1 } });
    }

    static countUsersByFilter(filters: Record<string, any>) {
        return collUser.countDocuments({ ...filters });
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
     * 根据 document TYPE_INVITATION 进行聚合
     * @param domainId 默认域参数
     * @param fields 额外的返回字段
     * @param filters 筛选条件
     * @returns cursor aggregate
     */
    static async getChannelAggr(domainId: string, fields: string[] = [], filters: Record<string, any> = {}) {
        const stages = [];
        const firstMatch = { domainId, docType: DocumentModel.TYPE_INVITATION };
        // 该渠道绑定的 uid
        if (typeof filters.owner === 'number') {
            firstMatch['owner'] = filters.owner;
        }
        // 渠道集合的 id
        if (typeof filters.channelId === 'object') {
            firstMatch['_id'] = filters.channelId;
        }
        // 渠道绑定的 inviteCode
        if (typeof filters.inviteCode === 'string') {
            firstMatch['docId'] = filters.inviteCode;
        }
        // 第一次匹配缩小集合范围
        stages.push({ $match: firstMatch });

        const fieldsSet = new Set(fields);

        // 处理中间数据依赖
        if (['groupBy', 'groupByOwner', 'groupByInviteCode'].some((v) => fieldsSet.has(v))) {
            fieldsSet.add('invitedUser');
            fieldsSet.add('groupBy');
        }

        // 关联渠道用户
        if (fieldsSet.has('invitedUser')) {
            const $and = [];
            $and.push({ $in: ['$_id', '$$curUids'] });
            if (filters.beginAt) {
                $and.push({ $gte: ['$regat', filters.beginAt] });
            }
            if (filters.endAt) {
                $and.push({ $lt: ['$regat', filters.endAt] });
            }
            stages.push({
                $lookup: {
                    from: 'user',
                    let: {
                        curUids: '$users',
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
                    as: 'invitedUser',
                },
            });
            stages.push({
                $unwind: {
                    path: '$invitedUser',
                    preserveNullAndEmptyArrays: false,
                },
            });
        }

        // 以渠道用户分组统计
        if (fieldsSet.has('groupBy')) {
            // 通过上面 unwind 后，数据记录更改类似为 owner,uid 组成唯一索引
            const $group = {
                _id: {},
                count: { $sum: 1 },
            };
            if (fieldsSet.has('groupByOwner')) {
                $group._id['owner'] = '$owner';
            }
            if (fieldsSet.has('groupByUser')) {
                $group._id['uid'] = '$invitedUser._id';
                $group['user'] = {
                    $first: {
                        uid: '$invitedUser._id',
                        regat: '$invitedUser.regat',
                        userRole: '$invitedUser.userRole',
                        uname: '$invitedUser.uname',
                        realName: '$invitedUser.realName',
                    },
                };
            }
            if (fieldsSet.has('groupByInviteCode')) {
                $group._id['docId'] = '$docId';
            }

            if (filters.definedStatDates?.length) {
                stages.push({
                    $addFields: {
                        statDates: {
                            $filter: {
                                input: filters.definedStatDates,
                                as: 'item',
                                cond: {
                                    $and: [
                                        {
                                            $gte: ['$invitedUser.regat', '$$item.beginAt'],
                                        },
                                        {
                                            $lt: ['$invitedUser.regat', '$$item.endAt'],
                                        },
                                    ],
                                },
                            },
                        },
                    },
                });
                stages.push({
                    $addFields: {
                        statDates: {
                            $map: {
                                input: '$statDates',
                                as: 'item',
                                in: {
                                    $concat: [{ $toString: { $toLong: '$$item.beginAt' } }, '|', { $toString: { $toLong: '$$item.endAt' } }],
                                },
                            },
                        },
                    },
                });
                stages.push({
                    $unwind: {
                        path: '$statDates',
                        preserveNullAndEmptyArrays: false,
                    },
                });
                // 通过上面 unwind 后，数据记录更改类似为 owner,uid,statDates 组成唯一索引
                $group._id['statDates'] = '$statDates';
            }
            stages.push({
                $group,
            });
            stages.push({
                $sort: { count: -1 }, // 按匹配数量降序
            });
        }

        for (const s of this.getPageStages(filters)) {
            stages.push(s);
        }

        return collDoc.aggregate(stages);
    }

    /**
     * 根据 user oplog 进行聚合
     * @param domainId 默认域参数
     * @param fields 额外的返回字段
     * @param filters 筛选条件
     * @returns cursor aggregate
     */
    static getUserOpAggr(domainId: string, fields: string[] = [], filters: Record<string, any> = {}) {
        const stages = [];
        const firstMatch = {};
        const $and = [];
        // 统计操作时间的开始时间
        if (typeof filters.beginAt === 'object') {
            $and.push({
                time: {
                    $gte: filters.beginAt,
                },
            });
        }
        // 统计操作时间的结束时间
        if (typeof filters.endAt === 'object') {
            $and.push({
                time: {
                    $lt: filters.endAt,
                },
            });
        }
        // 筛选活跃用户
        if (filters.isActive) {
            $and.push({
                operator: { $gt: 0 },
            });
        }
        if ($and.length) {
            firstMatch['$and'] = $and;
        }
        // 第一次匹配缩小集合范围
        stages.push({ $match: firstMatch });
        // 统计去重
        if (filters.isActive) {
            // 统计活跃度的时候，以用户的 id 去重
            stages.push({
                $group: {
                    _id: {
                        id: '$operator',
                    },
                },
            });
        } else {
            // 统计访客量的时候，以用户 id，ip，和浏览器指纹
            stages.push({
                $group: {
                    _id: {
                        ip: '$operateIp',
                        ua: '$ua',
                        id: '$operator',
                    },
                },
            });
        }
        const $group = {
            _id: {},
            count: { $sum: 1 },
        };
        if (filters.definedStatDates?.length) {
            stages.push({
                $addFields: {
                    statDates: {
                        $filter: {
                            input: filters.definedStatDates,
                            as: 'item',
                            cond: {
                                $and: [
                                    {
                                        $gte: ['$time', '$$item.beginAt'],
                                    },
                                    {
                                        $lt: ['$time', '$$item.endAt'],
                                    },
                                ],
                            },
                        },
                    },
                },
            });
            stages.push({
                $addFields: {
                    statDates: {
                        $map: {
                            input: '$statDates',
                            as: 'item',
                            in: {
                                $concat: [{ $toString: { $toLong: '$$item.beginAt' } }, '|', { $toString: { $toLong: '$$item.endAt' } }],
                            },
                        },
                    },
                },
            });
            stages.push({
                $unwind: {
                    path: '$statDates',
                    preserveNullAndEmptyArrays: false,
                },
            });
            $group._id['statDates'] = '$statDates';
        }
        stages.push({
            $group,
        });
        return collOp.aggregate(stages);
    }

    static getUserCount(filters: Record<string, any> = {}) {
        return collUser.countDocuments(filters);
    }

    static getUserOpCount(filters: Record<string, any> = {}) {
        return collOp.countDocuments(filters);
    }

    static getSubmitCount(filters: Record<string, any> = {}) {
        return collSubmit.countDocuments(filters);
    }
}
