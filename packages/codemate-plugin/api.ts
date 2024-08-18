import { Logger } from 'hydrooj';

export * from './plugins/privilege-group/model';
export * as plist from './plugins/assign-problem-list/model';
export * as bulletin from './plugins/bulletin/model';
export * as invitation from './plugins/invite-code/model';

export const logger = new Logger('codemate');
