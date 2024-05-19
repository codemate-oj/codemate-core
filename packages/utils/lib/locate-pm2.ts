const PATH = process.env.PATH?.split(':') || [];

// @ts-ignore
const pm2: typeof import('pm2') | null = (() => {
    return require('pm2');
})();

export default pm2;
