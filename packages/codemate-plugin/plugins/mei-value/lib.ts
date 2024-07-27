// @ts-expect-error alipay-sdk has no type declaration
import { AlipaySdk, AlipaySdkConfig } from 'alipay-sdk';
import { BadRequestError, Err, Handler, Logger, NotFoundError, ObjectID, SystemError } from 'hydrooj';

export const logger = new Logger('meiValue');
export const AlipaySDKError = Err('AlipaySDKError', SystemError, 'Alipay sdk error: {0}');
export const OrderNotFoundError = Err('OrderNotFoundError', NotFoundError, 'OrderId not found: {0}');
export const OrderError = Err('OrderError', BadRequestError, 'OrderId cannot been paied: {0}');

declare module 'hydrooj' {
    interface Lib {
        alipaySdk: () => AlipayCodemateSdk;
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
