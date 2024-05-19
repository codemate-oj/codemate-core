import path from 'path';

const PATH = process.env.PATH?.split(':') || [];

// @ts-ignore
const pm2: typeof import('pm2') | null = (() => {
    for (const dir of PATH) {
        try {
            const p = path.resolve(dir.split('.bin')[0], 'pm2');
            if (require.resolve(p)) return require(p); // eslint-disable-line import/no-dynamic-require
        } catch (e) {
        }
    }
    return null;
})();

export default pm2;
