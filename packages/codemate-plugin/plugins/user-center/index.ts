import { Context, ForbiddenError, Handler, param, post, PRIV, TokenModel, Types, Udoc, UserModel, UserNotFoundError } from 'hydrooj';
import { omit } from 'lodash';

class UserCenterHandler extends Handler {
    async get() {
        this.response.body = {
            udoc: omit(this.user._udoc, 'hash', 'salt', 'hashType'),
        };
    }

    @param('nickname', Types.String, true)
    @param('nationality', Types.String, true)
    @param('regionCode', Types.String, true) // 国内行政区划代码（国外用000000代替）
    @param('userRole', Types.PositiveInt, true) // 用户角色（如机构老师、学生等）
    @param('age', Types.Int, true)
    @param('oier', Types.Boolean)
    @param('sex', Types.PositiveInt, true)
    @param('school', Types.String, true)
    @param('schoolGrade', Types.String, true)
    @param('parentPhone', Types.Phone, true)
    @param('commentFocus', Types.String, true) // 重点关注
    @param('commentPursue', Types.String, true) // 核心诉求
    @param('learnLevel', Types.String, true) // 目前学习阶段
    @param('academicLevel', Types.String, true) // 学术圈层
    async post(_: string, ...args: unknown[]) {
        const argNames = [
            'nickname',
            'nationality',
            'regionCode',
            'userRole',
            'age',
            'oier',
            'sex',
            'school',
            'schoolGrade',
            'parentPhone',
            'commentFocus',
            'commentPursue',
            'learnLevel',
            'academicLevel',
        ];

        if (this.user.verifyInfo.verifyPassed) {
            const fixedArgs = ['age', 'sex'];
            const fixedArgsIndex = fixedArgs.map((i) => argNames.indexOf(i));
            for (const i of fixedArgsIndex) {
                if (args[i] !== undefined) {
                    throw new ForbiddenError('Authenticaed user is not allowed to modify gender or age');
                }
            }
        }

        const $update: Partial<UserModel> = {};
        for (let i = 0; i < argNames.length; i++) {
            if (args[i] !== undefined) $update[argNames[i]] = args[i];
        }
        await UserModel.setById(this.user._id, $update);
        this.response.body = { success: true };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('user_center', '/user/center', UserCenterHandler, PRIV.PRIV_USER_PROFILE);
}
