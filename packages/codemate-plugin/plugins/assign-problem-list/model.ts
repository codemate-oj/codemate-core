import { ContestNotFoundError, Document, DocumentModel as document, Filter, ObjectId, PERM, PRIV, Projection, UserModel } from 'hydrooj';
import { GroupModel } from '../privilege-group/model';
import { ProblemListNotFountError } from './lib';

const TYPE_PROBLEM_LIST = document.TYPE_PROBLEM_LIST;

export interface ProblemList extends Document {
    docId: ObjectId;
    docType: typeof TYPE_PROBLEM_LIST;
    title: string;
    content: string;
    // 题单功能
    pids: number[];
    assign?: string[];
    hidden?: boolean; // 是否将题单隐藏, 避免题单在配置过程中出现泄题
    visibility: 'private' | 'public' | 'system'; // 控制题单可见性：该doc用于个人题单和系统题单
    // 树状题单功能
    parent: ObjectId | null;
    children?: ObjectId[];
}

export async function get(domainId: string, tid: ObjectId, projection?: Projection<ProblemList>): Promise<ProblemList> {
    const tdoc = await document.get(domainId, TYPE_PROBLEM_LIST, tid, projection);
    if (!tdoc) throw new ContestNotFoundError(tid);
    return tdoc;
}

export function getMulti(domainId: string, query: Filter<ProblemList> = {}, projection?: Projection<ProblemList>) {
    return document.getMulti(domainId, TYPE_PROBLEM_LIST, query, projection);
}

export async function getWithChildren(
    domainId: string,
    tid: ObjectId,
    projection?: Projection<ProblemList>,
    enableHidden?: boolean,
): Promise<ProblemList> {
    const root = await get(domainId, tid, projection);
    if (!(enableHidden || !root.hidden)) {
        root.pids = [];
        return root;
    }
    if (root.children?.length) {
        const subPids = await Promise.all(root.children.map(async (c) => (await getWithChildren(domainId, c, projection, enableHidden)).pids));
        root.pids.push(...Array.from(new Set(subPids.flat())));
    }
    return root;
}

export async function add(
    domainId: string,
    title: string,
    content: string,
    owner: number,
    visibility: 'private' | 'public' | 'system',
    pids: number[],
    data: Partial<ProblemList> = {},
    parent: ObjectId = null,
) {
    const res = await document.add(domainId, content, owner, TYPE_PROBLEM_LIST, null, null, null, {
        ...data,
        title,
        visibility,
        pids,
        parent,
    });
    if (parent) {
        // 若有parent则更新parent.children
        await document.set(domainId, TYPE_PROBLEM_LIST, parent, undefined, undefined, { children: res });
    }
    return res;
}

export async function edit(domainId: string, tid: ObjectId, $set: Partial<ProblemList>) {
    const tdoc = await document.get(domainId, TYPE_PROBLEM_LIST, tid);
    if (!tdoc) throw new ProblemListNotFountError(tid);
    if ($set.parent) {
        // 先删除之前的parent.children
        if (tdoc.parent) {
            const ptdoc = await get(domainId, tdoc.parent);
            await document.set(domainId, TYPE_PROBLEM_LIST, ptdoc._id, {
                children: ptdoc.children.filter((id) => !tdoc.docId.equals(id)),
            });
        }
        // 若有parent则更新parent.children
        await document.set(domainId, TYPE_PROBLEM_LIST, $set.parent, undefined, undefined, undefined, { children: tdoc._id });
    }
    const res = await document.set(domainId, TYPE_PROBLEM_LIST, tid, $set);
    return res;
}

export async function del(domainId: string, tid: ObjectId) {
    const tdoc = await get(domainId, tid);
    if (!tdoc) throw new ProblemListNotFountError(tid);
    if (tdoc.parent) {
        const ptdoc = await get(domainId, tdoc.parent);
        await document.set(domainId, TYPE_PROBLEM_LIST, ptdoc._id, {
            children: ptdoc.children.filter((id) => !tdoc.docId.equals(id)),
        });
    }
    await document.deleteOne(domainId, TYPE_PROBLEM_LIST, tid);
}

// 检查用户是否具有题单权限
export async function checkPerm(domainId: string, tid: ObjectId, uid: number) {
    const tdoc = await get(domainId, tid);
    const user = await UserModel.getById(domainId, uid);

    // 若用户有超管权限或拥有题单，直接返回true
    if (user.hasPriv(PRIV.PRIV_ALL) || user.own(tdoc)) return true;

    // 题单没有assign直接返回true
    const assign = tdoc.assign;
    if (!assign || assign.length === 0) return true;

    // 检查assign中任何小组是否与用户小组有交集，若有则返回true
    return (await Promise.all(tdoc.assign.map((g) => GroupModel.has(domainId, user._id, g)))).some(Boolean);
}
