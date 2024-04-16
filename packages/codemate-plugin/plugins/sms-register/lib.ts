import { Err, Logger, ValidationError } from 'hydrooj';

export const SMSConfigureError = Err('SMSConfigureError', ValidationError);
export const MailConfigureError = Err('MailConfigureError', ValidationError);
export const logger = new Logger('register-ex');
