import { Context, Handler, PERM } from 'hydrooj';
import { InvitatonModel } from './model';

class InvitationCreateHandler extends Handler {
    async post() {
        const code = await InvitatonModel.add(this.domain._id, this.user._id);
        this.response.body = {
            success: true,
            code,
        };
    }
}

export function apply(ctx: Context) {
    ctx.Route('invitation_create', '/invite_code/create', InvitationCreateHandler, PERM.PERM_EDIT_DOMAIN);
}
