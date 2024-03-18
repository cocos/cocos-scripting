import fs from 'fs-extra';
import ps from 'path';

export function genSymLinks() {
    const h = (path: string) => ps.join(__dirname, 'spec', path);
    link(h('assets-real'), h('assets-symlink'));
    link(h('target.ts'), h('symlink.ts'));

    function link(target: string, path: string) {
        if (!fs.pathExistsSync(path)) {
            fs.symlinkSync(target, path);
        }
    }
}
