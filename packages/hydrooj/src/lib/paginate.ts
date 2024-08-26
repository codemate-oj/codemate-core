import { FindCursor } from 'mongodb';
import { ValidationError } from '../error';
import db from '../service/db';

/**
 * 对 MongoDB 查询进行分页。
 *
 * @param {FindCursor<T>} cursor - MongoDB 查询游标。
 * @param {number} page - 要检索的页码（1 开始）。
 * @param {number} pageSize - 每页的文档数量。
 * @return {Promise<[T[], number, number]>} [data: T[], numPages: number, count: number] 当前分页的数据，页数，总数量
 */
async function paginate<T>(cursor: FindCursor<T>, page: number, pageSize: number): Promise<[docs: T[], numPages: number, count: number]> {
    if (page <= 0) throw new ValidationError('page');
    let filter = {};
    for (const key of Object.getOwnPropertySymbols(cursor)) {
        if (key.toString() !== 'Symbol(filter)') continue;
        filter = cursor[key];
        break;
    }
    const coll = db.collection(cursor.namespace.collection as any);
    const [count, pageDocs] = await Promise.all([
        Object.keys(filter).length ? coll.count(filter) : coll.countDocuments(filter),
        cursor
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .toArray(),
    ]);
    const numPages = Math.floor((count + pageSize - 1) / pageSize);
    return [pageDocs, numPages, count];
}

export = paginate;
