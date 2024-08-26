import { AlipaySdk, AlipaySdkConfig } from 'alipay-sdk';
import WxPay from 'wechatpay-node-v3';
import { BadRequestError, Err, Handler, Logger, NotFoundError, ObjectID, SystemError } from 'hydrooj';

export const logger = new Logger('meiValue');
export const AlipaySDKError = Err('AlipaySDKError', SystemError, 'Alipay sdk error: {0}');
export const WxSDKError = Err('WxSDKError', SystemError, 'Wxpay sdk error: {0}');
export const OrderNotFoundError = Err('OrderNotFoundError', NotFoundError, 'OrderId not found: {0}');
export const OrderError = Err('OrderError', BadRequestError, 'OrderId cannot been paied: {0}');

declare module 'hydrooj' {
    interface Lib {
        alipaySdk: () => AlipayCodemateSdk;
        wxpaySdk: () => WxpayCodemateSdk;
        consumeMeiValue: (
            handler: Handler,
            userId: number,
            domainId: string,
            tradeSubject: string,
            tradeComment: string,
            tradeMeiValue: number,
        ) => Promise<ConsumeMeiValueResult>;
    }
}

export type ConsumeMeiValueResult =
    | {
          success: false;
          msg: string;
      }
    | {
          success: true;
          tradeNo: ObjectID;
      };

export class AlipayCodemateSdk {
    alipaySdk: AlipaySdk;
    constructor(config: AlipaySdkConfig) {
        try {
            this.alipaySdk = new AlipaySdk(config);
        } catch (err) {
            throw new AlipaySDKError(err);
        }
    }

    async orderPay(tradeNo: string, totalRMBAmount: number, subject: string) {
        logger.debug(`[ALIPAY] tradeNo: ${tradeNo}, amount: ${totalRMBAmount}, subject: ${subject}`);
        const result = this.alipaySdk.pageExec('alipay.trade.page.pay', {
            biz_content: {
                out_trade_no: tradeNo,
                total_amount: totalRMBAmount,
                subject,
                product_code: 'FAST_INSTANT_TRADE_PAY',
            },
            notify_url: 'http://pc-11-302.jinyuchata.top:18888/mei_value/notifier/alipay',
        });
        return result;
    }

    async queryFeedback(tradeNo: string) {
        const result = await this.alipaySdk.exec('alipay.trade.query', {
            biz_content: {
                out_trade_no: tradeNo,
            },
        });
        logger.debug(result);
        return result;
    }
}

export class WxpayCodemateSdk {
    wxpaySdk: WxPay;
    appid: string;
    mchid: string;
    key: string;
    notifier: string;
    constructor(appid: string, mchid: string, publicKey: string, privateKey: string, key: string, notifier: string) {
        this.appid = appid;
        this.mchid = mchid;
        this.key = key;
        this.notifier = notifier;
        this.wxpaySdk = new WxPay({
            appid,
            mchid,
            publicKey: Buffer.from(publicKey),
            privateKey: Buffer.from(privateKey),
        });
    }

    async orderPay(tradeNo: string, totalRMBAmount: number, subject: string) {
        logger.debug(`[WXPAY] tradeNo: ${tradeNo}, amount: ${totalRMBAmount}, subject: ${subject}`);
        try {
            const params = {
                appid: this.appid,
                mchid: this.mchid,
                description: subject,
                out_trade_no: tradeNo,
                notify_url: this.notifier,
                amount: {
                    total: totalRMBAmount * 100,
                },
            };
            const result = await this.wxpaySdk.transactions_native(params);
            logger.debug(`request result: ${JSON.stringify(result)}`);
            if (result.status !== 200) {
                throw new WxSDKError(result.message);
            }
            return result;
        } catch (error) {
            logger.error(`request error: ${error}`);
            return undefined;
        }
    }
}
