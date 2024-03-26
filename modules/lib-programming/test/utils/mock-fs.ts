
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

export default fs as typeof import('fs') & {
    use (volume: any): void;
};
