import fs from 'fs';
import path from 'path';

const PATH = process.env.PATH?.split(':') || [];

// @ts-ignore
const pm2: typeof import('pm2') | null = (() => {
    for (const dir of PATH) {
        try {
            let info;
            try {
                info = fs.readlinkSync(path.resolve(dir.split('.bin')[0], 'pm2'));
            } catch {
                info = dir;
            }
            const p = path.resolve(dir, info);
            return require(`${p.split('.bin')[0]}pm2`); // eslint-disable-line import/no-dynamic-require
        } catch (e) {
            console.log(e);
        }
    }
    return null;
})();

export default pm2;
