import { Context, Handler, param, Types, Udoc, UserModel, UserNotFoundError } from 'hydrooj';
import {
    AlreadyVerifiedError,
    DuplicatedIDNumberError,
    IDNumberValidationError,
    logger,
    RealnameVerifyStatus,
    UserSex,
    validateIDNumber,
    VerifyNotPassError,
} from './lib';

export class IDVerifyHandler extends Handler {
    udoc: Udoc;
    async prepare() {
        // 禁止为登录请求
        if (this.user._id <= 1) throw new UserNotFoundError(this.user._id);
        const udoc = await UserModel.getById(this.domain._id, this.user._id);
        if (!udoc) throw new UserNotFoundError(this.user._id);
        this.udoc = udoc._udoc;
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
        if (!validateIDNumber(idNumber)) throw new IDNumberValidationError(idNumber); // 过滤无效身份证号
        if (this.udoc.verifyPassed) throw new AlreadyVerifiedError(); // 不允许重复提交认证

        // 禁止重复注册
        const dupNum = await UserModel.getMulti({ idNumber }).count();
        if (dupNum > 0) throw new DuplicatedIDNumberError(idNumber);

        // 先写入实名信息到数据库
        if (this.udoc.realName || this.udoc.idNumber) {
            logger.warn(
                `User ${this.user._id} already have real name ${this.udoc.realName} and id number ${this.udoc.idNumber}, which will be overwritten.`,
            );
        }
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
