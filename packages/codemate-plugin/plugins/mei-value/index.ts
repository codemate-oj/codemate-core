import {
    Context,
    ForbiddenError,
    Handler,
    ObjectId,
    OplogModel,
    param,
    type PaymentOrderDoc,
    PRIV,
    query,
    SettingModel,
    SolutionModel,
    SystemModel,
    Types,
    UserModel,
    UserNotFoundError,
} from 'hydrooj';
import { coll as oplogColl } from 'hydrooj/src/model/oplog';
import { AlipayCodemateSdk, ConsumeMeiValueResult, logger, OrderError, OrderNotFoundError, WxpayCodemateSdk } from './lib';
import { MEI_VALUE_RATIO, PaymentOrderModel } from './model';

declare module 'hydrooj' {
    interface Udoc {
        meiValue?: number;
    }
}

interface MeiValueOperation {
    action: 'chargeOrder' | 'chargeSuccess' | 'consume' | 'transfer';

    // all
    domainId: string;
    userId: number;
    meiValueAfterOp: number;
    comment?: string;

    // chargeOrder | chargeSuccess
    orderId?: ObjectId;
    meiValueDelta?: number;
}

const MEI_VALUE_OPLOG_TYPE = 'meiValue.operation';

async function modifyMeiValue(_this: any, domainId: string, userId: number, op: Partial<MeiValueOperation>) {
    const udoc = await UserModel.getById(domainId, userId);
    await OplogModel.log(_this, MEI_VALUE_OPLOG_TYPE, {
        domainId,
        userId,
        meiValueAfterOp: udoc._udoc.meiValue ?? 0,
        ...op,
    });
}

class MeiValueOperationHandler extends Handler {
    async prepare() {
        if (this.user._id <= 1) throw new ForbiddenError(this.user._id);
        const udoc = await UserModel.getById(this.domain._id, this.user._id);
        if (!udoc) throw new UserNotFoundError(this.user._id);
    }

    async get() {
        const opLogs = await oplogColl
            .find({
                type: MEI_VALUE_OPLOG_TYPE,
                domainId: this.domain._id,
                userId: this.user._id,
            })
            .sort({ time: -1 })
            .project({
                action: 1,
                domainId: 1,
                userId: 1,
                meiValueAfterOp: 1,
                comment: 1,
                orderId: 1,
                meiValueDelta: 1,
                time: 1,
            })
            .toArray();
        this.response.body = { operations: opLogs };
    }
}

class MeiValueHandler extends Handler {
    async prepare() {
        if (this.user._id <= 1) throw new ForbiddenError(this.user._id);
        const udoc = await UserModel.getById(this.domain._id, this.user._id);
        if (!udoc) throw new UserNotFoundError(this.user._id);
    }

    async get() {
        this.response.body = { meiValue: this.user._udoc.meiValue ?? 0 };
    }
}

class MeiValueOrderHandler extends Handler {
    async prepare() {
        if (this.user._id <= 1) throw new ForbiddenError(this.user._id);
        const udoc = await UserModel.getById(this.domain._id, this.user._id);
        if (!udoc) throw new UserNotFoundError(this.user._id);
    }

    @query('orderId', Types.ObjectId, false)
    async get(domainId: string, orderId: ObjectId) {
        const order = await PaymentOrderModel.get(domainId, orderId);
        if (order === null) {
            throw new OrderNotFoundError(orderId);
        }
        this.response.body = { order };
    }

    @param('chargeCount', Types.PositiveInt)
    async post(domainId: string, chargeCount: number) {
        const chargeRMB = chargeCount / MEI_VALUE_RATIO;

        // generate order
        const orderSubject = `魅值下单：${chargeCount} 点`;
        const orderDescription = `用户${this.user._id} 下单魅值 ${chargeCount} 点`;
        const orderId = await PaymentOrderModel.add(domainId, this.user._id, orderSubject, orderDescription, chargeRMB, chargeCount);
        modifyMeiValue(this, domainId, this.user._id, {
            action: 'chargeOrder',
            orderId,
            meiValueDelta: 0.0,
        });
        logger.debug(`order: ${orderId}, subject: ${orderSubject}, desc: ${orderDescription}`);

        this.response.body = {
            success: true,
            charge: chargeCount,
            orderId,
            orderSubject,
            orderDescription,
        };
    }
}

async function checkAndRefreshCharge(domainId: string, orderId: ObjectId, paymentType: 'Alipay' | 'Wechat' | 'MeiValue', _this: any) {
    // validate payment
    const order = await PaymentOrderModel.get(domainId, orderId);
    if (order === null) {
        throw new OrderNotFoundError(orderId);
    }
    if (order.isPaied) {
        // already charged, return
        return;
    }
    const userId = order.owner;

    // not-paied orders should terminates here
    const orderPartial: Partial<PaymentOrderDoc> = {};
    if (paymentType === 'Alipay') {
        const alipaySdk = global.Hydro.lib.alipaySdk();
        const feedback = await alipaySdk.queryFeedback(orderId.toString());
        logger.debug('alipay sync feedback', feedback);
        // https://opendocs.alipay.com/mini/05xsky?scene=common&pathHash=354e8be3
        // 交易状态：WAIT_BUYER_PAY（交易创建，等待买家付款）、TRADE_CLOSED（未付款交易超时关闭，或支付完成后全额退款）、TRADE_SUCCESS（交易支付成功）、TRADE_FINISHED（交易结束，不可退款）
        if (
            feedback['code'] !== '10000' ||
            feedback['msg'] !== 'Success' ||
            !['TRADE_FINISHED', 'TRADE_SUCCESS'].includes(feedback['tradeStatus'] || feedback['trade_status'])
        ) {
            throw new OrderError('订单尚未完成支付');
        }
        // payment: 'Pending' | 'Alipay' | 'Wechat';
        // isPaied: Boolean;
        // payAt?: Date;
        // paymentInfo?: JSON;
        orderPartial.payment = 'Alipay';
        orderPartial.paymentInfo = feedback;
    } else if (paymentType === 'Wechat') {
        const wechatSdk = global.Hydro.lib.wxpaySdk();
        const feedback = await wechatSdk.wxpaySdk.query({ out_trade_no: orderId.toString() });
        // https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_1_2.shtml
        // 交易状态，枚举值：SUCCESS：支付成功 REFUND：转入退款 NOTPAY：未支付 CLOSED：已关闭 REVOKED：已撤销（仅付款码支付会返回）USERPAYING：用户支付中（仅付款码支付会返回） PAYERROR：支付失败（仅付款码支付会返回）
        if (feedback['status'] !== 200 || !['SUCCESS'].includes(feedback['tradeState'] || feedback['trade_state'])) {
            throw new OrderError('订单尚未完成支付');
        }
        orderPartial.payment = 'Wechat';
        orderPartial.paymentInfo = feedback;
        logger.debug('wechatpay feedback', feedback);
    } else if (paymentType === 'MeiValue') {
        const udoc = await UserModel.getById(domainId, userId);
        if (!udoc) throw new UserNotFoundError(userId);
        if (order.totalMeiValue < 0 && (udoc._udoc.meiValue ?? 0) < -order.totalMeiValue) {
            throw new OrderError('魅值不足');
        }
        orderPartial.payment = 'MeiValue';
    } else {
        throw new OrderError('错误的支付类型');
    }

    // after payment check...
    orderPartial.isPaied = true;
    orderPartial.payAt = new Date();

    // TODO: transaction here
    // inc charge value
    await UserModel.setById(userId, undefined, undefined, undefined, {
        meiValue: order.totalMeiValue,
    });
    modifyMeiValue(_this, domainId, userId, {
        action: 'chargeSuccess',
        orderId,
        meiValueDelta: order.totalMeiValue,
        comment: `支付方式: ${paymentType}`,
    });
    await PaymentOrderModel.set(domainId, orderId, orderPartial);
}

class MeiValueConsumeHandler extends Handler {
    @param('id', Types.ObjectId)
    @param('type', Types.Range(['名师原创题目', '名师文字题解', '名师视频题解', '名师知识点视频题解', '专家视频评卷']))
    async post(domainId: string, id: ObjectId, type: string) {
        // 名师原创题目 名师文字题解 名师视频题解 名师知识点视频题解 专家视频评卷
        if (['名师文字题解', '名师视频题解'].includes(type)) {
            const solution = await SolutionModel.get(domainId, id);
            const price = solution.price || 0;
            if (await PaymentOrderModel.countValidOrder(domainId, this.user._id, type, id)) {
                throw new OrderError('已购买，请勿重复操作');
            } else if (price < 0) {
                throw new OrderError('该订单价格异常');
            }
            const orderId = await PaymentOrderModel.addMeiValueOp(domainId, this.user._id, `购买${type}`, `魅值消耗： ${price}`, -price, {
                type,
                id,
                validUntil: new Date(new Date().getTime() + 30 * 24 * 3600 * 1000),
            });
            await checkAndRefreshCharge(domainId, orderId, 'MeiValue', this);
            this.response.body = {
                data: {
                    success: true,
                    message: '购买成功',
                    data: await PaymentOrderModel.get(domainId, orderId),
                },
            };
        } else {
            this.response.body = {
                data: {
                    success: false,
                    message: '未上线此增值服务',
                },
            };
        }
    }
}

class MeiValuePayHandler extends Handler {
    async prepare() {
        if (this.user._id <= 1) throw new ForbiddenError(this.user._id);
        const udoc = await UserModel.getById(this.domain._id, this.user._id);
        if (!udoc) throw new UserNotFoundError(this.user._id);
    }

    @query('orderId', Types.ObjectId, false)
    async get(domainId: string, orderId: ObjectId) {
        logger.debug(`domainId=${domainId}, orderId=${orderId}`);
        const order = await PaymentOrderModel.get(domainId, orderId);
        if (order === null) {
            throw new OrderNotFoundError(orderId);
        }
        if (order.isPaied) {
            throw new OrderError('订单已经完成');
        }

        // generate_alipay_link
        const alipaySdk = global.Hydro.lib.alipaySdk();
        const alipayHtml = await alipaySdk.orderPay(orderId.toString(), order.totalRMBAmount, order.title);
        logger.debug('alipay', alipayHtml);
        // generate wechat qrcode link
        const wxpaySdk = global.Hydro.lib.wxpaySdk();
        const wxpayResp = await wxpaySdk.orderPay(orderId.toString(), order.totalRMBAmount, order.title);
        logger.debug('wxpay', wxpayResp);
        const wxpayQrCodeUrl = wxpayResp.code_url;
        this.response.body = {
            success: true,
            payment: {
                alipayHtml,
                wxpayQrCodeUrl,
            },
        };
    }

    @param('orderId', Types.ObjectId, false)
    @param('paymentType', Types.Range(['Alipay', 'Wechat']), false)
    async post(domainId: string, orderId: ObjectId, paymentType: 'Alipay' | 'Wechat') {
        await checkAndRefreshCharge(domainId, orderId, paymentType, this);
        this.response.body = {
            success: true,
            msg: '更新充值状态成功',
        };
    }
}

class MeiValueNotifierAlipayHandler extends Handler {
    @param('out_trade_no', Types.ObjectId, false)
    async post(domainId: string, orderId: ObjectId) {
        const sdk = global.Hydro.lib.alipaySdk();
        const validate = sdk.alipaySdk.checkNotifySign(this.request.body);
        logger.info(`alipay notified: ${orderId}, checkSign: ${validate}`);
        if (validate) {
            try {
                logger.info(`sign validated success`);
                await checkAndRefreshCharge(domainId, orderId, 'Alipay', this);
                this.response.body = 'success';
            } catch (e) {
                logger.info(`sign validated fail`);
                this.response.body = 'fail';
            }
        } else {
            this.response.body = 'fail';
        }
    }
}

class MeiValueNotifierWxpayHandler extends Handler {
    @param('resource', Types.Any, false)
    async post(domainId: string, resource: any) {
        const { ciphertext, associated_data, nonce } = resource;
        const sdk = global.Hydro.lib.wxpaySdk();
        const result = sdk.wxpaySdk.decipher_gcm(ciphertext, associated_data, nonce, sdk.key);
        const orderId = result['out_trade_no'];
        logger.info(`sign validated success`);
        await checkAndRefreshCharge(domainId, ObjectId.createFromHexString(orderId), 'Wechat', this);
        this.response.body = 'success';
    }
}

export async function apply(ctx: Context) {
    ctx.Route('mei_value', '/mei_value', MeiValueHandler);
    ctx.Route('mei_value_consume', '/mei_value/consume', MeiValueConsumeHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('mei_value_operations', '/mei_value/operations', MeiValueOperationHandler);
    ctx.Route('mei_value_order', '/mei_value/order', MeiValueOrderHandler);
    ctx.Route('mei_value_pay', '/mei_value/pay', MeiValuePayHandler);
    ctx.Route('mei_value_notifier_alipay', '/mei_value/notifier/alipay', MeiValueNotifierAlipayHandler);
    ctx.Route('mei_value_notifier_wx', '/mei_value/notifier/wx', MeiValueNotifierWxpayHandler);

    ctx.inject(['setting'], async (c) => {
        c.setting.SystemSetting(
            SettingModel.Setting('setting_secrets', 'mei.alipay.appId', '', 'text', 'Alipay AppId', 'Alipay AppId'),
            SettingModel.Setting('setting_secrets', 'mei.alipay.privateKey', '', 'text', 'Alipay Private Key', 'Alipay Private Key'),
            SettingModel.Setting('setting_secrets', 'mei.alipay.alipayPublicKey', '', 'text', 'Alipay Public Key', 'Alipay Public Key'),
            SettingModel.Setting('setting_secrets', 'mei.alipay.endpoint', '', 'text', 'Alipay Endpoint', 'Alipay Endpoint'),
            SettingModel.Setting('setting_secrets', 'mei.alipay.alipayNotifer', '', 'text', 'Alipay Notifier', 'Alipay Notifier'),

            SettingModel.Setting('setting_secrets', 'mei.wxpay.appid', '', 'text', 'Wxpay Appid', 'Wxpay Appid'),
            SettingModel.Setting('setting_secrets', 'mei.wxpay.mchid', '', 'text', 'Wxpay mchid', 'Wxpay mchid'),
            SettingModel.Setting('setting_secrets', 'mei.wxpay.private_key', '', 'text', 'Wxpay private_key', 'Wxpay private_key'),
            SettingModel.Setting('setting_secrets', 'mei.wxpay.public_key', '', 'text', 'Wxpay public_key', 'Wxpay public_key'),
            SettingModel.Setting('setting_secrets', 'mei.wxpay.key', '', 'text', 'Wxpay key', 'Wxpay key'),
            SettingModel.Setting('setting_secrets', 'mei.wxpay.wxpayNotifer', '', 'text', 'Wxpay notifer', 'Wxpay notifier'),
        );
    });

    global.Hydro.lib.wxpaySdk = () => {
        const wxpayAppId = SystemModel.get('mei.wxpay.appid');
        const wxpayMchId = SystemModel.get('mei.wxpay.mchid');
        const wxpayPrivateKey = SystemModel.get('mei.wxpay.private_key');
        const wxpayPublicKey = SystemModel.get('mei.wxpay.public_key');
        const wxpayKey = SystemModel.get('mei.wxpay.key');
        const wxpayNotifer = SystemModel.get('mei.wxpay.wxpayNotifer');
        if (!wxpayAppId || !wxpayMchId || !wxpayPrivateKey || !wxpayPublicKey || !wxpayKey || !wxpayNotifer) {
            throw new Error('Wxpay service is not configured');
        }
        return new WxpayCodemateSdk(wxpayAppId, wxpayMchId, wxpayPublicKey, wxpayPrivateKey, wxpayKey, wxpayNotifer);
    };

    global.Hydro.lib.alipaySdk = () => {
        const alipayAppId = SystemModel.get('mei.alipay.appId');
        const alipayPrivateKey = SystemModel.get('mei.alipay.privateKey');
        const alipayPublicKey = SystemModel.get('mei.alipay.alipayPublicKey');
        const alipayEndpoint = SystemModel.get('mei.alipay.endpoint');
        const alipayNotifer = SystemModel.get('mei.alipay.alipayNotifer');

        if (!alipayAppId || !alipayPrivateKey || !alipayPublicKey || !alipayEndpoint || !alipayNotifer) {
            throw new Error('Alipay service is not configured');
        }
        logger.debug(alipayNotifer);
        const alipayConfig = {
            appId: alipayAppId,
            gateway: alipayEndpoint,
            privateKey: alipayPrivateKey,
            alipayPublicKey,
        };
        return new AlipayCodemateSdk(alipayConfig, alipayNotifer);
    };

    global.Hydro.lib.consumeMeiValue = async (
        handler: Handler,
        userId: number,
        domainId: string,
        tradeSubject: string,
        tradeComment: string,
        tradeMeiValue: number,
    ): Promise<ConsumeMeiValueResult> => {
        if (tradeMeiValue < 0) {
            return {
                success: false,
                msg: '消费魅值数量不得小于0',
            };
        }
        const udoc = await UserModel.getById(domainId, userId);
        if (!udoc) throw new UserNotFoundError(userId);
        const meiValue = udoc._udoc.meiValue ?? 0;
        if (meiValue < tradeMeiValue) {
            return {
                success: false,
                msg: '魅值不足',
            };
        }
        const consumeOrderId: ObjectId = new ObjectId();
        await UserModel.setById(userId, undefined, undefined, undefined, {
            meiValue: -tradeMeiValue,
        });
        modifyMeiValue(handler, domainId, userId, {
            action: 'consume',
            orderId: consumeOrderId,
            meiValueDelta: -tradeMeiValue,
            comment: `${tradeSubject}: ${tradeComment}`,
        });
        return {
            success: true,
            tradeNo: consumeOrderId,
        };
    };
}
