import { FindCursor } from 'mongodb';
import { Context, DocumentModel, Handler, ObjectId, paginate, param, PERM, route, SettingModel, SystemModel, Types } from 'hydrooj';
import { DbVariable, getDbVariable } from '../../lib/getDbVariable';

class BulletinBaseHandler extends Handler {
    bulletinTags: DbVariable<string[]>;

    async _prepare({ domainId }) {
        this.bulletinTags = await getDbVariable(`bulletinTags_${domainId}`);
    }
}

export interface BulletinDoc {
    docId: ObjectId;
    docType: typeof DocumentModel.TYPE_BULLETIN;
    title: string;
    content: string;
    tags: string[];
    postAt: number; // time stamp
    owner: number;
}

export class BulletinAdminBaseHandler extends BulletinBaseHandler {
    async prepare() {
        this.checkPerm(PERM.PERM_EDIT_DOMAIN);
    }
}

export class BulletinCreateHandler extends BulletinAdminBaseHandler {
    @param('title', Types.String)
    @param('content', Types.String)
    @param('tags', Types.CommaSeperatedArray)
    async post(domainId: string, title: string, content: string, _tags: string) {
        const tags = _tags.split(',');
        const docId = await DocumentModel.add(domainId, content, this.user._id, DocumentModel.TYPE_BULLETIN, null, null, null, {
            title,
            tags,
            postAt: Date.now(),
        });
        this.response.body = {
            docId,
        };
    }
}

export class BulletinListHandler extends BulletinBaseHandler {
    @param('page', Types.Int, true)
    @param('limit', Types.Int, true)
    @param('tags', Types.CommaSeperatedArray, true)
    async get(domainId: string, page = 1, limit: number, _tags: string = '') {
        if (limit < 1 || limit > SystemModel.get('pagination.bulletin')) limit = SystemModel.get('pagination.bulletin');
        const tags = _tags.split(',');
        let cursor: FindCursor<BulletinDoc>;
        if (_tags === '') {
            cursor = DocumentModel.getMulti(domainId, DocumentModel.TYPE_BULLETIN);
        } else {
            cursor = DocumentModel.getMulti(domainId, DocumentModel.TYPE_BULLETIN, {
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

export class BulletinTagsListHandler extends BulletinBaseHandler {
    async get() {
        this.response.body = {
            bulletinTags: this.bulletinTags.value,
        };
    }
}

export class BulletinTagsEditHandler extends BulletinAdminBaseHandler {
    @param('tags', Types.String)
    async post(domainId: string, _tags: string) {
        this.bulletinTags.value = _tags.split(',');
        this.response.body = {
            success: true,
            bulletinTags: this.bulletinTags.value,
        };
    }
}

export class BulletinDetailHandler extends BulletinBaseHandler {
    @route('bid', Types.ObjectId)
    async get(domainId: string, bid: ObjectId) {
        const bdoc = await DocumentModel.get(domainId, DocumentModel.TYPE_BULLETIN, bid);
        this.response.body = {
            bdoc,
        };
    }
}

export function apply(ctx: Context) {
    ctx.Route('bulletin_create', '/bulletin/create', BulletinCreateHandler);
    ctx.Route('bulletin_list', '/bulletin/list', BulletinListHandler);
    ctx.Route('bulletin_tags_list', '/bulletin/tags', BulletinTagsListHandler);
    ctx.Route('bulletin_tags_edit', '/bulletin/tags/edit', BulletinTagsEditHandler);
    ctx.Route('bulletin_detail', '/bulletin/detail/:bid', BulletinDetailHandler);

    ctx.inject(['setting'], (c) => {
        c.setting.SystemSetting(SettingModel.Setting('setting_basic', 'pagination.bulletin', 10, 'number', 'Bulletin page size'));
    });
}
