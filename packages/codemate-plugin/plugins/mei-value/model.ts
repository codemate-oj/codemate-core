import { type Collections, db, ObjectId } from 'hydrooj';

export interface PaymentOrderDoc {
    _id: ObjectId;
    domainId: string;
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

declare module 'hydrooj' {
    interface Collections {
        order: PaymentOrderDoc;
    }
    interface Model {
        order: PaymentOrderModel;
    }
}

export const collOrder = db.collection('order' as keyof Collections);

export class PaymentOrderModel {
    static async add(domainId: string, userOwner: number, subject: string, description: string, totalRMBAmount: number, totalMeiValue: number) {
        const odoc: PaymentOrderDoc = {
            _id: new ObjectId(),
            domainId,
            title: subject,
            content: description,
            owner: userOwner,
            totalRMBAmount,
            totalMeiValue,
            orderAt: new Date(),
            payment: 'Pending',
            isPaied: false,
        };
        return (await collOrder.insertOne(odoc)).insertedId;
    }

    static async get(domainId: string, orderId: ObjectId) {
        return collOrder.findOne({ _id: orderId, domainId });
    }

    static async set(domainId: string, orderId: ObjectId, $set: Partial<PaymentOrderDoc>) {
        return await collOrder.updateOne({ domainId, _id: orderId }, { $set });
    }
}
