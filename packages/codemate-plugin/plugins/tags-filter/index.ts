import lodash from 'lodash';
import { LRUCache } from 'lru-cache';
import { Context, Handler, param, PRIV, ProblemDoc, Types, ValidationError } from 'hydrooj';

declare module 'hydrooj' {
    interface Lib {
        tagsFilter: (tags: string[]) => string[];
        problemTagsFilter: (pdoc: ProblemDoc) => ProblemDoc;
    }
}

declare module '../kv-service' {
    interface KVTypes {
        tagsFilters: string[];
    }
}

class ModifyTagsFilterHandler extends Handler {
    @param('addFilter', Types.String, true)
    @param('delFilter', Types.String, true)
    async post(domainId: string, addFilter?: string, delFilter?: string) {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        if (!addFilter && !delFilter) throw new ValidationError();
        const tagsFilters = (await this.ctx.kv.get('tagsFilters')) || [];
        if (addFilter) {
            if (!tagsFilters.includes(addFilter)) tagsFilters.push(addFilter);
            await this.ctx.kv.set('tagsFilters', tagsFilters);
        } else {
            if (!tagsFilters.includes(delFilter)) throw new ValidationError();
            tagsFilters.splice(tagsFilters.indexOf(delFilter), 1);
            await this.ctx.kv.set('tagsFilters', tagsFilters);
        }
        this.response.body = {
            success: true,
            tagsFilters,
        };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('tags_filter_modify', '/tagsFilter/modify', ModifyTagsFilterHandler);

    ctx.inject(['kv'], async (c) => {
        const tagsFilters = await c.kv.use('tagsFilters');
        tagsFilters.value ||= [];
        lodash.memoize.Cache = class extends LRUCache<string, string[]> {
            constructor() {
                super({
                    max: 500,
                });
            }
        };
        global.Hydro.lib.tagsFilter = lodash.memoize(
            (tags: string[]) =>
                tags.filter(
                    (tag) =>
                        !tagsFilters.value.some((filter) => {
                            return new RegExp(filter).test(tag);
                        }),
                ),
            (tags) => (tags ? tags.join(',') : ''),
        );
        global.Hydro.lib.problemTagsFilter = (pdoc: ProblemDoc) => ({
            ...pdoc,
            tag: global.Hydro.lib.tagsFilter(pdoc.tag),
        });

        // a simple hook, not covered all cases
        c.on('handler/after', (that) => {
            that.response.body['pdoc'] &&= global.Hydro.lib.problemTagsFilter(that.response.body['pdoc']);
            that.response.body['pdocs'] = that.response.body['pdocs']?.map((pdoc: any) => global.Hydro.lib.problemTagsFilter(pdoc));
            if (that.response.body['pdict']) {
                for (const [pid, pdoc] of Object.entries<any>(that.response.body['pdict'])) {
                    that.response.body['pdict'][pid] = global.Hydro.lib.problemTagsFilter(pdoc);
                }
            }
            if (that.response.body['psdict']) {
                for (const [pid, pdoc] of Object.entries<any>(that.response.body['psdict'])) {
                    that.response.body['psdict'][pid] = global.Hydro.lib.problemTagsFilter(pdoc);
                }
            }
        });
    });
}
