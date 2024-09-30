import { ContestModel, db, DocumentModel, Err, NotFoundError, ObjectId } from 'hydrooj';
import { UserGroupModel } from '../user-group/model';

export const HomeworkNotFoundError = Err('HomeworkNotFoundError', NotFoundError, 'Homework {0} not found.');

const collDoc = db.collection('document');
const collDocStatus = db.collection('document.status');

export class UserHomeworkModel {
    static document = DocumentModel;
    static contest = ContestModel;

    static get(domainId: string, homeworkId: ObjectId) {
        return collDoc.findOne({ domainId, _id: homeworkId, docType: DocumentModel.TYPE_CONTEST, rule: 'homework' });
    }

    static async listProblems(domainId: string, homeworkId: ObjectId) {
        const homeworkDoc = await this.get(domainId, homeworkId);
        if (!homeworkDoc) throw new HomeworkNotFoundError(homeworkId);
        return collDoc.find(
            { domainId, docType: DocumentModel.TYPE_PROBLEM, approved: true, docId: { $in: homeworkDoc.pids } },
            { projection: { pid: 1, brief: 1, title: 1, tag: 1 } },
        );
    }

    static async listMembers(domainId: string, homeworkId: ObjectId) {
        const homeworkDoc = await this.get(domainId, homeworkId);
        if (!homeworkDoc) throw new HomeworkNotFoundError(homeworkId);
        return collDocStatus.find({ domainId, docId: homeworkId, docType: DocumentModel.TYPE_CONTEST });
    }
}
