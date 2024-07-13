import { Document, DocumentModel as document, ObjectId, Projection } from 'hydrooj';
import { OrderNotFoundError } from './lib';

const TYPE_ORDER = document.TYPE_ORDER;

export interface PaymentOrder extends Document {
    docId: ObjectId;
    docType: typeof TYPE_ORDER;
    title: string; // subject
    content: string; // description
    owner: number;

    // 下单相关
    totalRMBAmount: number;
    totalMeiValue: number;
    orderAt: Date;

    // 支付相关
    payment: 'Pending' | 'Alipay' | 'Wechat';
    isPaied: Boolean;
    payAt?: Date;
    paymentInfo?: any;
}

export async function add(domainId: string, userOwner: number, subject: string, description: string, totalRMBAmount: number, totalMeiValue: number) {
    const res = await document.add(domainId, subject, userOwner, TYPE_ORDER, null, null, null, {
        title: subject,
        content: description,
        totalRMBAmount,
        totalMeiValue,
        orderAt: new Date(),
        payment: 'Pending',
        isPaied: false,
    });
    return res;
}

export async function get(domainId: string, orderId: ObjectId, projection?: Projection<PaymentOrder>): Promise<PaymentOrder> {
    const tdoc = await document.get(domainId, TYPE_ORDER, orderId, projection);
    if (!tdoc) throw new OrderNotFoundError(orderId);
    return tdoc;
}

export async function set(domainId: string, orderId: ObjectId, $set: Partial<PaymentOrder>) {
    const r = await document.set(domainId, TYPE_ORDER, orderId, $set);
    return r;
}
