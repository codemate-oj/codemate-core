import { Document, DocumentModel, Err, nanoid, NotFoundError, UserModel, UserNotFoundError } from 'hydrooj';

export interface InvitationDoc extends Document {
    docId: string;
    docType: typeof DocumentModel.TYPE_INVITATION;
    content: string;
    users: number[];
}

export const InvitationNotFoundError = Err('InvitationNotFoundError', NotFoundError, 'Invitation code {0} not found.');

export class InvitatonModel {
    static get(domainId: string, code: string): Promise<InvitationDoc> {
        return DocumentModel.get(domainId, DocumentModel.TYPE_INVITATION, code);
    }

    static add(domainId: string, owner: number) {
        const code = nanoid(8);
        return DocumentModel.add(domainId, code, owner, DocumentModel.TYPE_INVITATION, code, null, null, { users: [] });
    }

    static async registerCode(domainId: string, code: string, uid: number) {
        const cdoc = await this.get(domainId, code);
        if (!cdoc) {
            throw new InvitationNotFoundError(code);
        }
        const user = await UserModel.getById(domainId, uid);
        if (!user) {
            throw new UserNotFoundError(uid);
        }
        // 更新邀请码记录
        DocumentModel.set(domainId, DocumentModel.TYPE_INVITATION, cdoc.docId, undefined, undefined, undefined, {
            users: user._id,
        });
        // 更新用户记录
        UserModel.setById(user._id, { inviteCode: code });
        return cdoc;
    }
}
