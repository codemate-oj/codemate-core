import { Err, Logger, SystemError } from 'hydrooj';

export const SendSMSFailedError = Err('SendSMSFailedError', SystemError);

export const logger = new Logger('register-ex');
