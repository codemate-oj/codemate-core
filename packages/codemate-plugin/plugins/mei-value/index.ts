import { Context, Handler, ObjectId, OplogModel, param, query, Types, UserModel, UserNotFoundError } from 'hydrooj';
import { AlipayCodemateSdk, ConsumeMeiValueResult, logger, OrderError } from './lib';
import * as orderDoc from './model';

declare module 'hydrooj' {
    interface Udoc {
        meiValue?: number;
    }
}

const MEI_VALUE_RATIO = 10; // 10 meiValue = 1 RMB

class MeiValueHandler extends Handler {
    async prepare() {
        if (this.user._id <= 1) throw new UserNotFoundError(this.user._id);
        const udoc = await UserModel.getById(this.domain._id, this.user._id);
        if (!udoc) throw new UserNotFoundError(this.user._id);
    }

    async get() {
        const udoc = await UserModel.getById(this.domain._id, this.user._id);
        if (!udoc) throw new UserNotFoundError(this.user._id);
        this.response.body = { meiValue: udoc._udoc.meiValue ?? 0 };
    }
}

class MeiValueOrderHandler extends Handler {
    async prepare() {
        if (this.user._id <= 1) throw new UserNotFoundError(this.user._id);
        const udoc = await UserModel.getById(this.domain._id, this.user._id);
        if (!udoc) throw new UserNotFoundError(this.user._id);
    }

    @param('chargeCount', Types.PositiveInt)
    async post(domainId: string, chargeCount: number) {
        const udoc = await UserModel.getById(this.domain._id, this.user._id);
        if (!udoc) throw new UserNotFoundError(this.user._id);
        const chargeRMB = chargeCount / MEI_VALUE_RATIO;

        // generate order
        const orderSubject = `魅值下单：${chargeCount} 点`;
        const orderDescription = `用户${this.user._id} 下单魅值 ${chargeCount} 点`;
        const orderId = await orderDoc.add(domainId, this.user._id, orderSubject, orderDescription, chargeRMB, chargeCount);

        await OplogModel.log(this, 'mei.order', {
            orderId,
            userId: this.user._id,
            chargeCount,
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

async function checkAndRefreshCharge(domainId: string, orderId: ObjectId, paymentType: 'Alipay' | 'Wechat', _this: any) {
    // validate payment
    const order = await orderDoc.get(domainId, orderId);
    if (order.isPaied) {
        // already charged, return
        return;
    }
    const userId = order.owner;

    // not-paied orders should terminates here
    const orderPartial: Partial<orderDoc.PaymentOrder> = {};
    if (paymentType === 'Alipay') {
        const alipaySdk = global.Hydro.lib.alipaySdk();
        const feedback = await alipaySdk.queryFeedback(orderId.toString());
        logger.debug('alipay sync feedback', feedback);
        if (feedback['code'] !== '10000' || feedback['msg'] !== 'Success') {
            throw new OrderError('订单尚未完成支付');
        }
        // payment: 'Pending' | 'Alipay' | 'Wechat';
        // isPaied: Boolean;
        // payAt?: Date;
        // paymentInfo?: JSON;
        orderPartial.payment = 'Alipay';
        orderPartial.paymentInfo = feedback;
    } else {
        throw new OrderError('错误的支付类型');
    }

    // after payment check...
    orderPartial.isPaied = true;
    orderPartial.payAt = new Date();

    // TODO: transaction here
    // inc charge value
    await OplogModel.log(_this, 'mei.chargeSuccessIncrement', {
        orderId,
        userId: _this.user._id,
        chargeCount: order.totalMeiValue,
        paymentType,
    });
    await UserModel.setById(userId, undefined, undefined, undefined, {
        meiValue: order.totalMeiValue,
    });
    await orderDoc.set(domainId, orderId, orderPartial);
}

class MeiValuePayHandler extends Handler {
    async prepare() {
        if (this.user._id <= 1) throw new UserNotFoundError(this.user._id);
        const udoc = await UserModel.getById(this.domain._id, this.user._id);
        if (!udoc) throw new UserNotFoundError(this.user._id);
    }

    @query('orderId', Types.ObjectId, false)
    async get(domainId: string, orderId: ObjectId) {
        const udoc = await UserModel.getById(this.domain._id, this.user._id);
        if (!udoc) throw new UserNotFoundError(this.user._id);

        const order = await orderDoc.get(domainId, orderId);
        if (order.isPaied) {
            throw new OrderError('订单已经完成');
        }

        // generate_alipay_link
        const alipaySdk = global.Hydro.lib.alipaySdk();
        const alipayHtml = await alipaySdk.orderPay(orderId.toString(), order.totalRMBAmount, order.title);
        logger.debug('alipay', alipayHtml);
        this.response.body = {
            success: true,
            payment: {
                alipayHtml,
            },
        };
    }

    @param('orderId', Types.ObjectId, false)
    @param('paymentType', Types.String, false)
    async post(domainId: string, orderId: ObjectId, paymentType: 'Alipay' | 'Wechat') {
        const udoc = await UserModel.getById(this.domain._id, this.user._id);
        if (!udoc) throw new UserNotFoundError(this.user._id);
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
                checkAndRefreshCharge(domainId, orderId, 'Alipay', this);
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

export async function apply(ctx: Context) {
    ctx.Route('mei_value', '/mei_value', MeiValueHandler);
    ctx.Route('mei_value_order', '/mei_value/order', MeiValueOrderHandler);
    ctx.Route('mei_value_pay', '/mei_value/pay', MeiValuePayHandler);
    ctx.Route('mei_value_notifier_alipay', '/mei_value/notifier/alipay', MeiValueNotifierAlipayHandler);

    ctx.inject(['kv'], async (c) => {
        const alipayAppId = await c.kv.use('mei.alipay.appId');
        alipayAppId.value ||= [''];
        const alipayPrivateKey = await c.kv.use('mei.alipay.privateKey');
        alipayPrivateKey.value ||= [''];
        const alipayPublicKey = await c.kv.use('mei.alipay.alipayPublicKey');
        alipayPrivateKey.value ||= [''];
        const alipayEndpoint = await c.kv.use('mei.alipay.endpoint');
        alipayEndpoint.value ||= [''];

        global.Hydro.lib.alipaySdk = () => {
            const alipayConfig = {
                appId: alipayAppId.value[0],
                gateway: alipayEndpoint.value[0],
                privateKey: alipayPrivateKey.value[0],
                alipayPublicKey: alipayPublicKey.value[0],
            };
            logger.info('ctx', ctx.domain);
            logger.info('alipayConfig');
            logger.info(alipayConfig);
            return new AlipayCodemateSdk(alipayConfig);
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
            await UserModel.setById(userId, undefined, undefined, undefined, {
                meiValue: -tradeMeiValue,
            });
            const logId = await OplogModel.log(handler, 'mei.consume', {
                tradeSubject,
                tradeComment,
                tradeMeiValue,
            });
            return {
                success: true,
                tradeNo: logId,
            };
        };
    });
}
