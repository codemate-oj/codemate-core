import { Err, ForbiddenError, Logger, NotFoundError } from 'hydrooj';

export const GroupNotFoundError = Err('GroupNotFoundError', NotFoundError, 'Group {0} not found.');
export const ActivationCodeNotFoundError = Err('ActivationCodeNotFoundError', NotFoundError, 'Activation code {0} not found.');
export const ActivationCodeExpiredError = Err('ActivationCodeExpiredError', ForbiddenError, 'Activation code {0} is expired at {1}.');
export const ActivationCodeUsedError = Err('ActivationCodeUedError', ForbiddenError, 'Activation code {0} has been used.');
export const DuplicatedActivationError = Err('DuplicatedActivationError', ForbiddenError, 'You are already in group {0}.');

export const logger = new Logger('groups');
