// @ts-check

const { QuickCompiler } = require('../../modules/quick-build-engine/lib/index');
const ps = require('path');
const logUpdate = require('log-update');
const { Stage } = require('../../modules/quick-build-engine/lib/progress');
const { StatsQuery } = require('../../modules/stats-query/lib');
const editorBrowserslistQuery = 'Electron 5.0.8';

module.exports.run = async (inputDir, outputDir) => {
    const outDir = outputDir;

    const statsQuery = await StatsQuery.create(inputDir);
    const excludeFeatures = [
        'physics-2d-builtin',
        'wait-for-ammo-instantiation',
    ];
    const editorFeatures = statsQuery.getFeatures().filter((f) => !excludeFeatures.includes(f));
    const featureUnitPrefix = 'cce:/internal/x/cc-fu/'; // cc-fu -> cc feature unit

    const targets = [
        {
            featureUnitPrefix,
            dir: ps.join(outDir, 'editor'),
            format: 'systemjs',
            // inlineSourceMap: true,
            // 使用 indexed source map 加快编译速度：
            // 见 https://github.com/cocos-creator/3d-tasks/issues/4720
            // indexedSourceMap: true,
            usedInElectron509: true,
            targets: editorBrowserslistQuery,
            includeIndex: {
                features: editorFeatures,
            },
            loader: true,
        },
        {
            featureUnitPrefix,
            dir: ps.join(outDir, 'preview'),
            format: 'systemjs',
            loose: true,
            // indexedSourceMap: true,
        },
    ];

    const log = logUpdate.create(process.stdout, {
        showCursor: true,
    });

    const targetProgresses = targets.map(() => '');

    console.time('build');
    const quickCompiler = new QuickCompiler({
        rootDir: inputDir,
        outDir,
        // @ts-ignore
        targets,
        logFile: 'log.txt',
        onProgress: (target, message) => {
            if (message.stage === Stage.transform) {
                const percentage = (message.progress / message.total * 100).toFixed(2);
                targetProgresses[target] =
                    `[QuickCompiler] ${target} Transforming... ${message.progress}/${message.total}(${percentage}%) ${message.file}`;
            } else if (message.stage === Stage.bundle) {
                targetProgresses[target] =
                    `[QuickCompiler] ${target} Bundling...`;
            }
            log(targetProgresses.join('\n'));
        },
    });
    await quickCompiler.build();
    // await (quickCompiler.buildImportMap());
    console.timeEnd('build');
};
