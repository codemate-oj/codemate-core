import { Document, DocumentModel, nanoid } from 'hydrooj';

export interface InvitationDoc extends Document {
    docId: string;
    docType: typeof DocumentModel.TYPE_INVITATION;
    content: string;
}

export class InvitatonModel {
    static get(domainId: string, code: string) {
        return DocumentModel.get(domainId, DocumentModel.TYPE_INVITATION, code);
    }

    static add(domainId: string, owner: number) {
        const code = nanoid(8);
        return DocumentModel.add(domainId, code, owner, DocumentModel.TYPE_INVITATION, code);
    }
}
