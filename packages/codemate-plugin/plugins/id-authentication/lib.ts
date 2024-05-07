import { Err, ForbiddenError, Logger, ValidationError } from 'hydrooj';

export const IDNumberValidationError = Err('IDNumberValidationError', ValidationError, 'ID number {0} is invalid.');
export const VerifyNotPassError = Err('VerifyNotPassError', ForbiddenError, 'Real-name info verification failed.');
export const AlreadyVerifiedError = Err('AlreadyVerifiedError', ForbiddenError, 'Real-name info has been verified.');
export const DuplicatedIDNumberError = Err('DuplicatedIDNumberError', ForbiddenError, 'ID number {0} has been used.');

export const logger = new Logger('id-auth');

export const enum RealnameVerifyStatus {
    MATCH,
    NOT_MATCH,
    NOT_FOUND,
}

export const enum UserSex {
    UNKNOWN = 3,
    MALE = 1,
    FEMALE = 2,
}

export type RealnameVerifyResult =
    | {
          success: false;
      }
    | {
          success: true;
          result: RealnameVerifyStatus;
          description: string; // 注释
          sex: '男' | '女';
          birthday: string; // '20240420'
          address: string; // 住址
      };

export const validateIDNumber = (idNumber: string) => {
    if (idNumber.length !== 18) {
        return false;
    }
    const factors = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    const checkCodeDict = { 0: '1', 1: '0', 2: 'X', 3: '9', 4: '8', 5: '7', 6: '6', 7: '5', 8: '4', 9: '3', 10: '2' };
    let total = 0;
    for (let i = 0; i < 17; i++) {
        total += parseInt(idNumber[i], 10) * factors[i];
    }
    const checkCode = checkCodeDict[total % 11];
    return checkCode === idNumber[17];
};

declare module 'hydrooj' {
    interface Lib {
        idVerify: (name: string, idCard: string) => Promise<RealnameVerifyResult>;
    }

    interface Udoc {
        realName?: string;
        idNumber?: string;
        verifyPassed?: boolean;
        sex?: UserSex;
    }
}
