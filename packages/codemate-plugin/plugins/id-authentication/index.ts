import { Context, Handler, param, Types, UserModel, UserNotFoundError } from 'hydrooj';
import { IDNumberValidationError, RealnameVerifyStatus, UserSex, validateIDNumber, VerifyNotPassError } from './lib';

export class IDVerifyHandler extends Handler {
    prepare() {
        // 禁止为登录请求
        if (this.user._id <= 1) throw new UserNotFoundError(this.user._id);
    }

    async get() {
        const udoc = await UserModel.getById(this.domain._id, this.user._id);
        if (!udoc) throw new UserNotFoundError(this.user._id);
        this.response.body = {
            idNumber: udoc.verifyInfo.idNumber ?? '',
            realName: udoc.verifyInfo.realName ?? '',
            verified: udoc.verifyInfo.verifyPassed,
        };
    }

    @param('idNumber', Types.String)
    @param('realName', Types.String)
    async post(_, idNumber: string, realName: string) {
        if (!validateIDNumber(idNumber)) throw new IDNumberValidationError(idNumber);

        // 先写入实名信息到数据库
        await UserModel.setById(this.user._id, { realName, idNumber, verifyPassed: false });

        // 调用API校验
        // TODO: 在写入数据库后发起校验任务就返回 使用schedule.slowRequest和GET接口查询
        const verifyResult = await global.Hydro.lib.idVerify(realName, idNumber);
        if (!verifyResult.success) throw new VerifyNotPassError();
        const { result, sex, ...infos } = verifyResult;
        await UserModel.setById(this.user._id, {
            verifyPassed: result === RealnameVerifyStatus.MATCH,
            ...infos,
            sex: sex === '女' ? UserSex.FEMALE : UserSex.MALE,
        });

        this.response.body = {
            success: true,
            code: result,
            idNumber,
            realName,
        };
    }
}

export function apply(ctx: Context) {
    ctx.Route('id_verify', '/user/verify', IDVerifyHandler);
}
