import { FindCursor } from 'mongodb';
import { Context, Handler, ObjectId, paginate, param, PERM, route, SettingModel, SystemModel, Types } from 'hydrooj';
import { BulletinDoc, BulletinModel } from './model';

class BulletinBaseHandler extends Handler {
    bulletinTags: { value: string[] };

    async _prepare({ domainId }) {
        this.bulletinTags = await this.ctx.kv.use(`bulletinTags_${domainId}`);
    }
}

class BulletinAdminBaseHandler extends BulletinBaseHandler {
    async prepare() {
        this.checkPerm(PERM.PERM_EDIT_DOMAIN);
    }
}

class BulletinListHandler extends BulletinBaseHandler {
    @param('page', Types.Int, true)
    @param('limit', Types.Int, true)
    @param('tags', Types.CommaSeperatedArray, true)
    async get(domainId: string, page = 1, limit: number, tags?: string[]) {
        if (!limit || limit < 1 || limit > SystemModel.get('pagination.bulletin')) limit = SystemModel.get('pagination.bulletin');
        let cursor: FindCursor<BulletinDoc>;
        if (!tags) {
            cursor = BulletinModel.getMulti(domainId);
        } else {
            cursor = BulletinModel.getMulti(domainId, {
                tags: { $elemMatch: { $in: tags } },
            });
        }
        const [bdocs, bdocsPage, bdocsCount] = await paginate(cursor, page, limit);
        this.response.template = 'bulletin_main.html';
        this.response.body = {
            bdocs,
            bdocsPage,
            bdocsCount,
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

class BulletinEditHandler extends BulletinAdminBaseHandler {
    @param('bid', Types.ObjectId, true)
    async get(domainId: string, bid: ObjectId) {
        const bdoc = bid ? await BulletinModel.get(domainId, bid) : null;
        this.response.template = 'bulletin_edit.html';
        this.response.body = {
            bdoc,
        };
    }

    @param('bid', Types.ObjectId, true)
    @param('title', Types.String)
    @param('tags', Types.CommaSeperatedArray)
    @param('content', Types.String)
    async postUpdate(domainId: string, bid: ObjectId, title: string, tags: string[], content: string) {
        const normalizedTags = tags.map((t) => t.trim().toLowerCase());
        if (!bid) {
            // 如果没有 bid 则是新建
            const docId = await BulletinModel.add(domainId, this.user._id, title, content, normalizedTags);
            this.response.body = {
                susccess: true,
                docId,
            };
            this.response.redirect = this.url('bulletin_edit', { bid: docId });
        } else {
            await BulletinModel.edit(domainId, bid, {
                title,
                content,
                tags: normalizedTags,
            });
            this.response.body = {
                success: true,
            };
            this.response.redirect = this.url('bulletin_edit', { bid });
        }
        // 更新成功后更新kv中的bulletinTags
        const newBulletinTags = new Set(normalizedTags.concat(this.bulletinTags.value || []));
        this.bulletinTags.value = Array.from(newBulletinTags);
    }

    @param('bid', Types.ObjectId)
    async postDelete(domainId: string, bid: ObjectId) {
        const result = await BulletinModel.del(domainId, bid);
        this.response.body = {
            success: result[0].deletedCount > 0,
        };
        this.response.redirect = this.url('bulletin_main');
    }
}

class BulletinTagsHandler extends BulletinBaseHandler {
    async get() {
        this.response.body = {
            bulletinTags: this.bulletinTags.value,
        };
    }
}

export function apply(ctx: Context) {
    ctx.Route('bulletin_tags_list', '/bulletin/tags', BulletinTagsHandler);
    ctx.Route('bulletin_create', '/bulletin/create', BulletinEditHandler, PERM.PERM_EDIT_DOMAIN);
    ctx.Route('bulletin_detail', '/bulletin/:bid', BulletinDetailHandler);
    ctx.Route('bulletin_edit', '/bulletin/:bid/edit', BulletinEditHandler, PERM.PERM_EDIT_DOMAIN);
    ctx.Route('bulletin_main', '/bulletin', BulletinListHandler);

    ctx.inject(['setting'], (c) => {
        c.setting.SystemSetting(
            SettingModel.Setting('setting_basic', 'pagination.bulletin', 10, 'number', 'pagination.bulletin', 'How many bulletin to show per page'),
        );
    });
}
