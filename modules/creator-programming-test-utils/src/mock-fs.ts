
jest.mock(`fs`, () => {
    const fs = jest.requireActual(`fs`);
    const unionFs = require(`unionfs`).default;
    unionFs.reset = () => {
        // fss is unionfs' list of overlays
        unionFs.fss = [fs];
    };
    unionFs.Stats = fs.Stats;
    return unionFs.use(fs);
});

import fs from 'fs';
import ps from 'path';

export default fs as typeof import('fs') & {
    use (volume: any): void;
};

export function generateAppropriateVirtualFSRootDir() {
    const fsRoot = process.platform === 'win32' ? String.raw`V:` : '/';
    return ps.join(fsRoot, '_unit_test_purpose_virtual_fs');
}