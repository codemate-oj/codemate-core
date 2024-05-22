import { FindCursor } from 'mongodb';
import { Context, Handler, ObjectId, paginate, param, PERM, route, SettingModel, SystemModel, Types } from 'hydrooj';
import { BulletinDoc, BulletinModel } from './model';

export * from './model';

class BulletinBaseHandler extends Handler {
    bulletinTags: { value: string[] };

    async _prepare({ domainId }) {
        this.bulletinTags = await this.ctx.kv.use<string[]>(`bulletinTags_${domainId}`);
    }
}

class BulletinAdminBaseHandler extends BulletinBaseHandler {
    async prepare() {
        this.checkPerm(PERM.PERM_EDIT_DOMAIN);
    }
}

class BulletinCreateHandler extends BulletinAdminBaseHandler {
    @param('title', Types.String)
    @param('content', Types.String)
    @param('tags', Types.CommaSeperatedArray)
    async post(domainId: string, title: string, content: string, _tags: string) {
        const tags = _tags.split(',');
        const docId = await BulletinModel.add(domainId, this.user._id, title, content, tags);
        this.response.body = {
            docId,
        };
    }
}

class BulletinListHandler extends BulletinBaseHandler {
    @param('page', Types.Int, true)
    @param('limit', Types.Int, true)
    @param('tags', Types.CommaSeperatedArray, true)
    async get(domainId: string, page = 1, limit: number, _tags: string = '') {
        if (limit < 1 || limit > SystemModel.get('pagination.bulletin')) limit = SystemModel.get('pagination.bulletin');
        const tags = _tags.split(',');
        let cursor: FindCursor<BulletinDoc>;
        if (_tags === '') {
            cursor = BulletinModel.getMulti(domainId);
        } else {
            cursor = BulletinModel.getMulti(domainId, {
                tags: { $elemMatch: { $in: tags } },
            });
        }
        const [bdocs, bdocsPage] = await paginate(cursor, page, limit);
        this.response.body = {
            bdocs,
            bdocsPage,
        };
    }
}

class BulletinTagsListHandler extends BulletinBaseHandler {
    async get() {
        this.response.body = {
            bulletinTags: this.bulletinTags.value,
        };
    }
}

class BulletinTagsEditHandler extends BulletinAdminBaseHandler {
    @param('tags', Types.String)
    async post(domainId: string, _tags: string) {
        this.bulletinTags.value = _tags.split(',');
        this.response.body = {
            success: true,
            bulletinTags: this.bulletinTags.value,
        };
    }
}

class BulletinDetailHandler extends BulletinBaseHandler {
    @route('bid', Types.ObjectId)
    async get(domainId: string, bid: ObjectId) {
        const bdoc = await BulletinModel.get(domainId, bid);
        this.response.body = {
            bdoc,
        };
    }
}

class BulletinDeleteHandler extends BulletinAdminBaseHandler {
    @route('bid', Types.ObjectId)
    async post(domainId: string, bid: ObjectId) {
        const result = await BulletinModel.del(domainId, bid);
        this.response.body = {
            success: result[0].deletedCount > 0,
        };
    }
}

export function apply(ctx: Context) {
    ctx.Route('bulletin_create', '/bulletin/create', BulletinCreateHandler);
    ctx.Route('bulletin_list', '/bulletin/list', BulletinListHandler);
    ctx.Route('bulletin_tags_list', '/bulletin/tags', BulletinTagsListHandler);
    ctx.Route('bulletin_tags_edit', '/bulletin/tags/edit', BulletinTagsEditHandler);
    ctx.Route('bulletin_detail', '/bulletin/detail/:bid', BulletinDetailHandler);
    ctx.Route('bulletin_delete', '/bulletin/delete/:bid', BulletinDeleteHandler);

    ctx.inject(['setting'], (c) => {
        c.setting.SystemSetting(SettingModel.Setting('setting_basic', 'pagination.bulletin', 10, 'number', 'Bulletin page size'));
    });
}
