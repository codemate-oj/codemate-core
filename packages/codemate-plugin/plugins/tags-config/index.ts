import { Context, Handler } from 'hydrooj';

class ProblemTagsHandler extends Handler {
    async get() {
        this.response.body = { problem_tags: this.domain.problem_tags };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('problem_tags', '/problem_tags_config', ProblemTagsHandler);
}
