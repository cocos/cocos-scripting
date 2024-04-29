const gift = require('tfig')
const ps = require('path').posix;
const fs = require('fs-extra');

const input = ps.join(__dirname, '../modules/entry/lib/index.d.ts');
const output = ps.join(__dirname, '../.api/public.d.ts');
const bundle = gift.bundle({
    input: [input],
    entries: {
        '@cocos/cocos-scripting': input,
    },
    output,
})

fs.writeFileSync(output, bundle.groups[0].code, 'utf8');