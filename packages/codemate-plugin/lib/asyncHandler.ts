import { DocumentModel, Handler, nanoid, param, Types } from 'hydrooj';
import { TaskNotFoundError } from './error';

type TaskResultDoc = {
    docId: string;
    finished: boolean;
    result: any;
};

export const TYPE_TASK_RESULT: 70 = 70;
declare module 'hydrooj' {
    interface DocType {
        [TYPE_TASK_RESULT]: TaskResultDoc;
    }
}

/*
BaseAsyncHandler: 一个通用的异步任务接口方案，通常在任务时间较久且前端需要获取任务执行结果时候使用。工作步骤：
1. 前端 POST 该接口，该接口会返回一个任务 ID;
2. 实际业务代码工作，请用 this.context.request.body 拿到请求参数;
3. 前端以该任务 ID 轮询任务是否完成（此时使用 GET）;
    - 如果此时任务尚未完成，返回 `{ finished: false }`;
    - 如果此时任务已完成，返回 `{ finished: true, result: 任务结果 }`，其中任务结果是一个 JSON.stringify 后的字符串;
4. 当任务完成时，返回响应结果。
实际使用时实现 work() 方法，该方法返回任务结果，不接受任何参数，如无必要请不要更改 get, post 函数。
*/
export class BaseAsyncHandler extends Handler {
    work: () => Promise<any>;

    @param('taskId', Types.String)
    async get(domainId: string, taskId: string) {
        const taskDoc: TaskResultDoc = await DocumentModel.get(domainId, TYPE_TASK_RESULT, taskId);
        if (!taskDoc) throw new TaskNotFoundError();
        if (!taskDoc.finished) {
            this.response.body = { finished: false };
        } else {
            this.response.body = {
                finished: true,
                result: JSON.stringify(taskDoc.result),
            };
        }
    }

    async post(domainId: string) {
        const taskId = nanoid();
        await DocumentModel.set(domainId, TYPE_TASK_RESULT, taskId);
        this.work().then((result) => {
            DocumentModel.set(domainId, TYPE_TASK_RESULT, taskId, {
                finished: true,
                result,
            });
        });
        this.response.body = { taskId };
    }
}
