import { Context, Handler, ObjectId, param, PRIV, Types } from 'hydrooj';
import TagModel from './model';

class TagManageBaseHandler extends Handler {
    async _prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }
}

class TagAddHandler extends TagManageBaseHandler {
    @param('name', Types.String)
    @param('alias', Types.ArrayOf<Types['String']>)
    @param('description', Types.String)
    async post(domainId: string, _name: string, alias: string[], _description: string) {
        const name = JSON.parse(_name);
        const description = JSON.parse(_description);
        const docId = await TagModel.add(domainId, name, alias, description);
        this.response.body = { docId };
    }
}

class TagEditHandler extends TagManageBaseHandler {
    @param('docId', Types.ObjectId)
    @param('name', Types.String)
    @param('alias', Types.ArrayOf<Types['String']>)
    @param('description', Types.String)
    async post(domainId: string, docId: ObjectId, _name: string, alias: string[], _description: string) {
        const name = JSON.parse(_name);
        const description = JSON.parse(_description);
        await TagModel.edit(domainId, docId, name, alias, description);
        this.response.body = { docId };
    }
}

class TagMainHandler extends Handler {
    async get({ domainId }) {
        const tags = await TagModel.getMulti(domainId);
        this.response.body = { tags };
    }
}

class TagDeleteHandler extends TagManageBaseHandler {
    @param('docId', Types.ObjectId)
    async get(domainId: string, docId: ObjectId) {
        await TagModel.del(domainId, docId);
        this.response.body = { success: true };
    }
}

class TagGetHandler extends Handler {
    @param('docId', Types.String)
    async get(domainId: string, docId: ObjectId) {
        this.response.body = { tagDoc: await TagModel.get(domainId, docId) };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('tag_add', '/tag/add', TagAddHandler);
    ctx.Route('tag_edit', '/tag/edit', TagEditHandler);
    ctx.Route('tag_main', '/tag/list', TagMainHandler);
    ctx.Route('tag_delete', '/tag/delete', TagDeleteHandler);
    ctx.Route('tag_get', '/tag/get', TagGetHandler);
}
