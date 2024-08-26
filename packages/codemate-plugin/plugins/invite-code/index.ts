import { Context, Handler, param, PERM, Types } from 'hydrooj';
import { InvitatonModel } from './model';

class InvitationCreateHandler extends Handler {
    @param('num', Types.PositiveInt, true)
    async post(domainId: string, num = 1) {
        const code = await Promise.all(Array.from({ length: num }, () => InvitatonModel.add(this.domain._id, this.user._id)));
        this.response.body = {
            success: true,
            code,
        };
    }
}

export function apply(ctx: Context) {
    ctx.Route('invitation_create', '/invite_code/create', InvitationCreateHandler, PERM.PERM_EDIT_DOMAIN);
}
