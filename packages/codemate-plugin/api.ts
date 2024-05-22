import { Logger } from 'hydrooj';

export * from './plugins/privilege-group/model';
export * as plist from './plugins/assign-problem-list/model';
export * as bulletin from './plugins/bulletin';

export const logger = new Logger('codemate');
