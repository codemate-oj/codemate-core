import { Context, Handler, PRIV } from 'hydrooj';
import { PricingRulesModel, ProblemTagsModel } from './model';

// 分类函数
function getCategorizeData(data) {
    return data.reduce((result, item) => {
        // 如果 subject 还没有分类，则创建 subject 分类
        result[item.subject] ||= {};

        // 如果 type 还没有分类，则创建 type 分类
        result[item.subject][item.type] ||= {};

        // 如果 category 还没有分类，则创建 category 分类
        result[item.subject][item.type][item.category] ||= [];

        // 将当前 item 添加到对应的分类下
        result[item.subject][item.type][item.category].push(item);

        return result;
    }, {});
}

class PricingRulesHandler extends Handler {
    async get() {
        const cursor = PricingRulesModel.list();
        const data = await cursor.toArray();
        this.response.body = {
            data: {
                data,
            },
        };
    }
}

class ProblemFormTagsHandler extends Handler {
    async get() {
        const cursor = ProblemTagsModel.list();
        const data = await cursor.toArray();
        this.response.body = {
            data: {
                data,
            },
        };
    }
}

class ProblemCategoryTagsHandler extends Handler {
    async get() {
        const data = await ProblemTagsModel.getCategoryTags().toArray();
        this.response.body = {
            data: {
                data,
            },
        };
    }
}

class ProblemStatTagsHandler extends Handler {
    async get() {
        const data = await ProblemTagsModel.getTagStat().toArray();
        this.response.body = {
            data: {
                data,
            },
        };
    }
}

class ProblemYamlTagsHandler extends Handler {
    async get() {
        const data = await ProblemTagsModel.getCategoryTags().toArray();
        const yamlArr = [];
        for (const c of data) {
            yamlArr.push(`${c.category}:`);
            for (const t of c.tags) {
                yamlArr.push(` - ${t}`);
            }
        }
        this.response.body = yamlArr.join('\n');
    }
}

class ProblemTagsTreeHandler extends Handler {
    async get() {
        const data = getCategorizeData(await ProblemTagsModel.list().toArray());
        this.response.body = {
            data: {
                data,
            },
        };
    }
}

class ProblemTagsOptionsHandler extends Handler {
    async get() {
        const categorizeData = getCategorizeData(await ProblemTagsModel.list().toArray());
        this.response.body = {
            data: {
                data: Object.keys(categorizeData).map((subject) => {
                    return {
                        label: subject,
                        children: Object.keys(categorizeData[subject]).map((type) => {
                            return {
                                label: type,
                                type,
                                children: Object.keys(categorizeData[subject][type]).map((category) => {
                                    return {
                                        label: category,
                                        type: category,
                                        children: categorizeData[subject][type][category].map((v) => {
                                            v.label = v.chapter;
                                            return v;
                                        }),
                                    };
                                }),
                            };
                        }),
                    };
                }),
            },
        };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('problem_tags_price', '/problem-tags/pricing', PricingRulesHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('problem_form_tags', '/problem-tags', ProblemFormTagsHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('problem_tags_category', '/problem-tags/category', ProblemCategoryTagsHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('problem_tags_category', '/problem-tags/stat', ProblemStatTagsHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('problem_tags_category_yaml', '/problem-tags/category/yaml', ProblemYamlTagsHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('problem_tags_tree', '/problem-tags/tree', ProblemTagsTreeHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('problem_tags_options', '/problem-tags/options', ProblemTagsOptionsHandler, PRIV.PRIV_USER_PROFILE);
}
