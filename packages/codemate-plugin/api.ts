import { Logger } from 'hydrooj';

export * from './plugins/privilege-group/model';
export * as plist from './plugins/assign-problem-list/model';
export * from './plugins/bulletin/index';

export const logger = new Logger('codemate');
