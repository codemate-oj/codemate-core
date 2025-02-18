import { db, ObjectId, PaymentOrderDoc } from 'hydrooj';

export const MEI_VALUE_RATIO = 1; // 1 meiValue = 1 RMB

declare module 'hydrooj' {
    interface Model {
        order: PaymentOrderModel;
    }
}

export const collOrder = db.collection('order');

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

    static async countValidOrder(domainId: string, owner: number, type: string, id: ObjectId) {
        return await collOrder.countDocuments({
            domainId,
            owner,
            isPaied: true,
            'paymentInfo.id': id,
            'paymentInfo.type': type,
            $or: [{ 'paymentInfo.validUntil': { $gt: new Date() } }, { 'paymentInfo.expried': false }],
        });
    }

    static async addMeiValueOp(domainId: string, owner: number, subject: string, description: string, totalMeiValue: number, paymentInfo: any) {
        const odoc: PaymentOrderDoc = {
            _id: new ObjectId(),
            domainId,
            title: subject,
            content: description,
            owner,
            totalRMBAmount: 0,
            totalMeiValue,
            orderAt: new Date(),
            payAt: new Date(),
            payment: 'Pending',
            isPaied: false,
            paymentInfo,
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
