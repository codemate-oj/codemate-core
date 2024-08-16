import { Err, Logger, SystemError, ValidationError } from 'hydrooj';

export const InvalidCaptchaTokenError = Err('InvalidCaptchaTokenError', ValidationError, 'Invalid captcha token.');
export const SendSMSFailedError = Err('SendSMSFailedError', SystemError);
export const VerifyCodeError = Err('VerifyCodeError', ValidationError, 'Invalid verification code.');

export const logger = new Logger('register-ex');
