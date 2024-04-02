#! /usr/bin/env node

import { program } from 'commander';
import { copyFileSync, ensureDirSync, readJsonSync } from 'fs-extra';
import { join } from 'path';
import { build } from './build';

program
    .name('ccms')
    .description('CLI to support a module system for Cocos engine')
    .version(readJsonSync(join(__dirname, '../package.json')).version as string);

program
    .command('init')
    .description(`init interface declaration of module system to the path 'CURRENT_PATH/@types/module-system.d.ts'`)
    .action(() => {
        const cwd = process.cwd();
        const typesPath = join(cwd, '@types');
        ensureDirSync(typesPath);
        copyFileSync(join(__dirname, '../module-system.d.ts'), join(typesPath, './module-system.d.ts'));
    });

program
    .command('build')
    .description('build module system to the specified platform.')
    .requiredOption('-p, --platform <string>', `target platform such as 'windows', 'web-mobile', etc.`)
    .requiredOption('-o, --out <string>', 'the path of output.')
    .option('-m, --minify', `whether to minify the output lib.`)
    .option('-s, --source-map', 'whether to generate source map of the lib.')
    .option('-h, --hmr', 'whether to build lib with a HMR extra.')
    .action(options => {
        options.minify = options.minify ?? false;
        options.sourceMap = options.sourceMap ?? false;
        options.hmr = options.hmr ?? false;
        return build(options);
    });

program.parse();