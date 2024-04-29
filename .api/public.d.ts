declare module "@cocos/cocos-scripting" {
    export function loadBuildEngineModule(): Promise<{
        buildEngine: BuildEngineFunc;
    }>;
    export function loadQuickBuildEngineModule(): Promise<{
        QuickCompiler: typeof QuickCompiler;
    }>;
    export function loadBuildProjectModule(): Promise<{
        buildScriptCommand: BuildScriptCommand;
    }>;
    export function loadQuickBuildProjectModule(): Promise<{
        PackerDriver: typeof PackerDriver;
    }>;
    export function loadQuickPackModule(): Promise<{
        QuickPackLoader: typeof QuickPackLoader;
        QuickPackLoaderContext: typeof QuickPackLoaderContext;
    }>;
    export function loadScriptExecutorModule(): Promise<{
        Executor: typeof Executor;
    }>;
    export function loadModuleSystem(): Promise<{
        build: BuildSystemJsFunc;
    }>;
    export function loadBuildPolyfillModule(): Promise<{
        buildPolyfills: BuildPolyFillsFunc;
    }>;
    export namespace Modularize {
        export type MinigamePlatformConfig = {
            [key in Lowercase<keyof typeof MinigamePlatform>]?: string;
        };
        export type NativePlatformConfig = {
            [key in Lowercase<keyof typeof NativePlatform>]?: string;
        };
        export type WebPlatformConfig = {
            [key in Lowercase<keyof typeof WebPlatform>]?: string;
        };
        export type PlatformType = Uppercase<keyof typeof WebPlatform | keyof typeof MinigamePlatform | keyof typeof NativePlatform> | "HTML5" | "NATIVE";
        /**
         * Abstract platform export, like `web`, `native` and `minigame`.
         * Usually this is used for PAL modules.
         * The build tools resolve the relative platform as entry according to the build platform config.
         * - The value can be a `string` or a `object` which requires a default item.
         * eg. { "web": "/path/to/index.ts" } is equals to { "web": { default: "/path/to/index.ts" } }.
         * - We can also specify the exact platform like
         * { "web": {default: "/path/to/index.ts", "web-desktop": "/path/to/index.ts" } }.
         */
        export type AbstractPlatformExport<T> = ({
            /**
             * Default platform export for unspecified platforms.
             */
            default: string;
        } & T) | string;
        /**
         * The export condition. `types` fields are required.
         */
        export type ExportCondition<T> = {
            /**
             * This is the main module export condition.
             * - The dts bundle tools resolve this condition as entry.
             * - The API doc tools resolve this condition as entry.
             * - If no platform export is specified, the build tools resolve this condition as entry.
             */
            types: string;
            /**
             * The custom condition, for example:
             * - For gfx module: {"webgl1": "/path/to/webgl1/index.ts", "webgl2": "/path/to/webgl2/index.ts"}
             * - For physics module {"cannon": "/path/to/cannon/index.ts", "physX": "/path/to/physX/index.ts"}
             */
            [customCondition: string]: string;
        } & T;
        export interface ConditionalExports {
            /**
             * This is exported to the game runtime.
             * Also we build the `cc.d.ts` with this export condition's `types` field.
             * `node` field is required to resolve the path of package.json for build tools.
             */
            ".": ExportCondition<{
                minigame?: AbstractPlatformExport<MinigamePlatformConfig>;
                native?: AbstractPlatformExport<NativePlatformConfig>;
                web?: AbstractPlatformExport<WebPlatformConfig>;
            }>;
            /**
             * This is exported to the engine internal.
             * It useful when we need to export some friend interfaces for internal engine modules.
             */
            "./internal"?: ExportCondition<{
                minigame?: AbstractPlatformExport<MinigamePlatformConfig>;
                native?: AbstractPlatformExport<NativePlatformConfig>;
                web?: AbstractPlatformExport<WebPlatformConfig>;
            }>;
            /**
             * This is exported to the editor, which is useful when we need to export some editor only interfaces.
             * Also we build `cc.editor.d.ts` from this export condition's `types` field.
             * If this is not specified, we use the '.' export condition by default for module editor export,
             * otherwise, the build tools merges '.' and './editor' exports together for editor runtime environment.
             * It is different with `web_editor` or `native_editor` platform export:
             * - this condition exports some editor specific interfaces which is not cross-platform.
             * - the `web_editor` or `native_editor` platform export is an editor version of implementation of interfaces defined in `types` field which should be cross-platform.
             */
            "./editor"?: ExportCondition<{}>;
            /**
             * This export provide a the path of javascript module which exports some method to query the info of module.
             */
            "./query"?: string;
        }
        export interface ModuleOverride {
            /**
             * The test string to evaluate.
             */
            test: string;
            /**
             * The override config, override mapping from key to value.
             */
            overrides: Record<string, string>;
        }
        export interface ModuleConfig {
            [key: string]: unknown;
            /**
             * The module name.
             */
            name: string;
            /**
             * The version of module.
             * It is useful when we change the module config, then we need to make some migration.
             * This usually comes with the `cc.migrations` field.
             */
            version: string;
            /**
             * The config for conditional exports.
             */
            exports?: ConditionalExports;
            /**
             * Specify the module dependencies is required if this module import another one.
             * We need this field to generate the module dependency graph.
             */
            dependencies?: Record<string, string>;
            /**
             * Specify the dev dependencies, these dependencies are always used in `scripts` folder.
             */
            devDependencies?: Record<string, string>;
            /**
             * The dependencies between modules form a tree-structured dependency graph.
             * The correct dependency relationship should be that the upper module depends on the lower module one-way, and the reverse is wrong.
             * However, it is normal for modules at the same layer to depend on each other, and such dependencies should be declared as `peerDependencies`.
             * Otherwise the Turbo pipeline will report an error due to module circular dependencies.
             * see: https://github.com/vercel/turbo/issues/1480
             */
            peerDependencies?: Record<string, string>;
            /**
             * This is a CC-specific item difference from the node package.json standard specification.
             */
            cc?: {
                /**
                 * The module asset dependencies, which is an array of asset uuid.
                 */
                assetDependencies?: string[];
                /**
                 * This is different with conditional exports.
                 * Sometimes we just want to override a script file instead of the whole module.
                 * Module override could support to do this job.
                 * - eg. { "test": "context.mode === 'BUILD'", "overrides": { "/path/to/dev.ts": "/path/to/build.ts" } }
                 */
                moduleOverrides?: ModuleOverride[];
            };
        }
        export interface ModuleQueryContext {
            /**
             * The engine root path.
             */
            engine: string;
            /**
             * The platform to resolve conditional export.
             */
            platform: PlatformType;
            /**
             * The custom export condition.
             * The higher the array is sorted, the higher the priority is.
             *
             * @example
             * ```ts
             * [ 'webgl1',  'cannon' ]  // the backend of 'gfx' and 'physics' modules.
             * ```
             */
            customExportConditions?: string[];
        }
        /**
         * The module info manager.
         */
        export class ModuleQuery {
            constructor(context: ModuleQueryContext);
            /**
             * Get all modules' name defined in engine workspaces.
             */
            getAllModules(): Promise<string[]>;
            /**
             * Get modules' all exports by module name.
             */
            getExports(moduleName: string): Promise<string[]>;
            /**
             * Get all the modules' exports.
             */
            getAllExports(): Promise<string[]>;
            /**
             * Get the map from module name to module path.
             */
            getExportMap(): Promise<Record<string, string>>;
            /**
             * Resolve module package.json path by module name.
             */
            resolvePackageJson(moduleName: string): Promise<string>;
            /**
             * Get module config by module name.
             */
            getConfig(moduleName: string): Promise<ModuleConfig>;
            /**
             * Resolve module entry path by import source.
             */
            resolveExport(source: string): Promise<string | void>;
            /**
             * To detect whether the module has a './editor' export.
             * @param moduleName
             */
            hasEditorSpecificExport(moduleName: string): Promise<boolean>;
        }
        export enum MinigamePlatform {
            WECHAT = 0,
            WECHAT_MINI_PROGRAM = 1,
            /**
             * @deprecated this platform has been removed.
             */
            BAIDU = 2,
            BYTEDANCE = 3,
            XIAOMI = 4,
            ALIPAY = 5,
            TAOBAO = 6,
            TAOBAO_MINIGAME = 7,
            OPPO = 8,
            VIVO = 9,
            HUAWEI = 10,
            /**
             * @deprecated this platform has been removed.
             */
            COCOSPLAY = 11,
            /**
             * @deprecated this platform has been removed.
             */
            QTT = 12,
            /**
             * @deprecated this platform has been removed.
             */
            LINKSURE = 13
        }
        export enum NativePlatform {
            NATIVE_EDITOR = 0,
            ANDROID = 1,
            WINDOWS = 2,
            IOS = 3,
            MAC = 4,
            OHOS = 5,
            OPEN_HARMONY = 6,
            LINUX = 7
        }
        export enum WebPlatform {
            WEB_EDITOR = 0,
            WEB_MOBILE = 1,
            WEB_DESKTOP = 2
        }
    }
    export namespace dtsBundler {
        export function build(options: Options): Promise<boolean>;
        export interface Options {
            engine: string;
            outDir: string;
        }
    }
    /**
     * @group Merged Types
     */
    export function buildEngine(options: buildEngine.Options): Promise<buildEngine.Result>;
    export namespace buildEngine {
        function transform(code: string, moduleOption: ModuleFormat, loose?: boolean): Promise<{
            code: string;
        }>;
        function isSourceChanged(incrementalFile: string): Promise<boolean>;
        /**
         * Enumerates all chunk files that used by specified feature units.
         * @param meta Metadata of build result.
         * @param featureUnits Feature units.
         */
        function enumerateDependentChunks(meta: buildEngine.Result, featureUnits: string[]): string[];
        /**
         * Enumerates all asset files that used by specified feature units.
         * @param meta Metadata of build result.
         * @param featureUnits Feature units.
         */
        function enumerateDependentAssets(meta: buildEngine.Result, featureUnits: string[]): string[];
        /**
         * Enumerates all chunk files and asset files that used by specified feature units.
         * @param meta Metadata of build result.
         * @param featureUnits Feature units.
         */
        function enumerateAllDependents(meta: buildEngine.Result, featureUnits: string[]): string[];
        export type ModuleFormat = "esm" | "cjs" | "system" | "iife";
        export interface Options {
            /**
             * 引擎仓库目录。
             */
            engine: string;
            /**
             * 输出目录。
             */
            out: string;
            mode: StatsQuery.ConstantManager.ModeType;
            platform: StatsQuery.ConstantManager.PlatformType;
            flags?: Partial<StatsQuery.ConstantManager.IFlagConfig>;
            /**
             * 包含的功能。
             */
            features?: string[];
            /**
             * 输出模块格式。
             * @default 'system'
             */
            moduleFormat?: ModuleFormat;
            /**
             * 是否对生成的脚本进行压缩。
             * @default false
             */
            compress?: boolean;
            /**
             * 是否生成 source map。
             * 若为 `inline` 则生成内联的 source map。
             * @default false
             */
            sourceMap?: boolean | "inline";
            /**
             * 若 `sourceMap` 为 `true`，此选项指定了 source map 的路径。
             * @default `${outputPath.map}`
             */
            sourceMapFile?: string;
            /**
             * 若为 `true`，分割出 **所有** 引擎子模块。
             * 否则，`.moduleEntries` 指定的所有子模块将被合并成一个单独的 `"cc"` 模块。
             * @default false
             */
            split?: boolean;
            /**
             * 原生代码的打包模式
             * - 为 `wasm` 时使用 wasm 版本原生库
             * - 为 `asmjs` 时使用 asmjs 版本的原生库
             * - 为 `both` 时同时在结果中包含 wasm 与 asmjs 两个版本的原生库
             */
            nativeCodeBundleMode?: "wasm" | "asmjs" | "both";
            /**
             * Wasm compression mode, 'brotli' means to compress .wasm to .wasm.br.
             * @note Currently, only WeChat and ByteDance mini-game support to load '.wasm.br' file.
             */
            wasmCompressionMode?: "brotli";
            /**
             * If true, all deprecated features/API are excluded.
             * You can also specify a version range(in semver range) to exclude deprecations in specified version(s).
             * @default false
             */
            noDeprecatedFeatures?: string | boolean;
            /**
             * Experimental.
             */
            incremental?: string;
            /**
             * BrowsersList targets.
             */
            targets?: string | string[] | Record<string, string>;
            /**
             * Enable loose compilation.
             *
             * @deprecated since 1.1.20, we force using true internal.
             */
            loose?: boolean;
            /**
             * How to generate the reference to external assets:
             * - `'relative-from-out'`
             * Generate the path relative from `out` directory, does not contain the leading './'.
             *
             * - `'relative-from-chunk'`
             * Generate the path relative from the referencing output chunk.
             *
             * - `'dynamic'`(default)
             * Use runtime `URL` API to resolve the absolute URL.
             * This requires `URL` and `import.meta.url` to be valid.
             */
            assetURLFormat?: "relative-from-out" | "relative-from-chunk" | "runtime-resolved";
            /**
             * Preserve engine type info, this options will build a TS engine to the output directory.
             * It's useful when we need to take a step towards the AOT optimization.
             * This options is only supported on Open Harmony platform for now.
             * @default false
             */
            preserveType?: boolean;
            visualize?: boolean | {
                file?: string;
            };
            /**
             * Generate cocos/native-binding/decorators.ts for native platforms
             */
            generateDecoratorsForJSB?: boolean;
            /**
             * Whether to generate 'named' register code for systemjs module format.
             * SystemJS default register code: System.register([], function(){...});
             * SystemJS named register code: System.register('module_name', [], function(){...});
             * @note It's only avaiable when options.moduleFormat is 'system'.
             */
            enableNamedRegisterForSystemJSModuleFormat?: boolean;
        }
        export interface Result {
            /**
             * Mappings between feature unit name and their actual chunk file, for example:
             * ```js
             * {
             *   "core": "./core.js",
             *   "gfx-webgl": "./gfx-webgl.js",
             * }
             * ```
             */
            exports: Record<string, string>;
            /**
             * The compulsory import mappings that should be applied.
             */
            chunkAliases: Record<string, string>;
            /**
             * The dependency graph, only including dependency chunks.
             *
             * @deprecated please use `chunkDepGraph` instead.
             */
            dependencyGraph?: Record<string, string[]>;
            chunkDepGraph: Record<string, string[]>;
            assetDepGraph: Record<string, string[]>;
            hasCriticalWarns: boolean;
        }
    }
    export type BuildEngineFunc = (options: buildEngine.Options) => Promise<buildEngine.Result>;
    /**
     * Query any any stats of the engine.
     * @group Merged Types
     */
    export class StatsQuery {
        /**
         * @param engine Path to the engine root.
         */
        static create(engine: string): Promise<StatsQuery>;
        /**
         * Constant manager for engine and user.
         */
        constantManager: StatsQuery.ConstantManager;
        /**
         * Gets the path to the engine root.
         */
        get path(): string;
        /**
         * Gets the path to tsconfig.
         */
        get tsConfigPath(): string;
        /**
         * Gets all optimzie decorators
         */
        getOptimizeDecorators(): ConfigInterface.IOptimizeDecorators;
        /**
         * Gets all features defined.
         */
        getFeatures(): string[];
        /**
         * Returns if the specified feature is defined.
         * @param feature Feature ID.
         */
        hasFeature(feature: string): boolean;
        /**
         * Gets all feature units included in specified features.
         * @param featureIds Feature ID.
         */
        getUnitsOfFeatures(featureIds: string[]): string[];
        getIntrinsicFlagsOfFeatures(featureIds: string[]): Record<string, number | boolean | string>;
        /**
         * Gets all feature units in their names.
         */
        getFeatureUnits(): string[];
        /**
         * Gets the path to source file of the feature unit.
         * @param moduleId Name of the feature unit.
         */
        getFeatureUnitFile(featureUnit: string): string;
        /**
         * Gets all editor public modules in their names.
         */
        getEditorPublicModules(): string[];
        /**
         * Gets the path to source file of the editor-public module.
         * @param moduleName Name of the public module.
         */
        getEditorPublicModuleFile(moduleName: string): string;
        /**
         * Gets the source of `'cc'`.
         * @param featureUnits Involved feature units.
         * @param mapper If exists, map the feature unit name into another module request.
         */
        evaluateIndexModuleSource(featureUnits: string[], mapper?: (featureUnit: string) => string): string;
        /**
         * Evaluates the source of `'internal-constants'`(`'cc/env'`),
         * @param context
         */
        evaluateEnvModuleSourceFromRecord(record: Record<string, unknown>): string;
        /**
         * Evaluates module overrides under specified context.
         * @param context
         */
        evaluateModuleOverrides(context: ConfigInterface.Context): Record<string, string>;
    }
    export namespace StatsQuery {
        export class ConstantManager {
            constructor(engineRoot: string);
            exportDynamicConstants({ mode, platform, flags, }: ConstantManager.ConstantOptions): string;
            genBuildTimeConstants(options: ConstantManager.ConstantOptions): ConstantManager.BuildTimeConstants;
            genCCEnvConstants(options: ConstantManager.ConstantOptions): ConstantManager.CCEnvConstants;
            exportStaticConstants({ mode, platform, flags, }: ConstantManager.ConstantOptions): string;
            genInternalConstants(): string;
            genCCEnv(): string;
        }
        export namespace ConstantManager {
            export type PlatformType = Modularize.PlatformType;
            export type IPlatformConfig = {
                [key in PlatformType]: boolean;
            };
            export interface IInternalFlagConfig {
                SERVER_MODE: boolean;
                NOT_PACK_PHYSX_LIBS: boolean;
                WEBGPU: boolean;
                /**
                 * Native code (wasm/asmjs) bundle mode, 0: asmjs, 1: wasm, 2: both
                 * @default 2
                 */
                NATIVE_CODE_BUNDLE_MODE: number;
                /**
                 * An internal constant to indicate whether we cull the meshopt wasm module and asm.js module.
                 *
                 * @default false
                 */
                CULL_MESHOPT: boolean;
                /**
                 * An internal constant to indicate whether we use wasm assets as minigame subpackage.
                 * This is useful when we need to reduce code size.
                 */
                WASM_SUBPACKAGE: boolean;
            }
            export interface IPublicFlagConfig {
                DEBUG: boolean;
                NET_MODE: number;
            }
            export interface IFlagConfig extends IInternalFlagConfig, IPublicFlagConfig {
            }
            export interface IModeConfig {
                EDITOR: boolean;
                PREVIEW: boolean;
                BUILD: boolean;
                TEST: boolean;
            }
            export interface IConstantOptions {
                platform: PlatformType;
                flagConfig: IFlagConfig;
            }
            export type ModeType = keyof IModeConfig;
            export type FlagType = keyof IFlagConfig;
            export interface BuildTimeConstants extends IPlatformConfig, IFlagConfig, IModeConfig {
            }
            export interface CCEnvConstants extends IPlatformConfig, IPublicFlagConfig, IModeConfig {
            }
            export type ValueType = boolean | number;
            export interface ConstantOptions {
                mode: ModeType;
                platform: PlatformType;
                flags: Partial<Record<FlagType, ValueType>>;
            }
        }
    }
    export namespace ConfigInterface {
        export interface Config {
            /**
             * Engine features. Keys are feature IDs.
             */
            features: Record<string, Feature>;
            /**
             * Describe how to generate the index module `'cc'`.
             * Currently not used.
             */
            index?: IndexConfig;
            moduleOverrides?: Array<{
                test: Test;
                overrides: Record<string, string>;
                isVirtualModule: boolean;
            }>;
            /**
             * Included files for quick-compiler.
             */
            includes: Array<string>;
            /**
             * The constants config for engine and user.
             */
            constants: IConstantConfig;
            /**
             * The decorators to be optimize when build engine.
             */
            optimizeDecorators: IOptimizeDecorators;
        }
        export interface IndexConfig {
            modules?: Record<string, {
                /**
                 * If specified, export contents of the module into a namespace specified by `ns`
                 * and then export that namespace into `'cc'`.
                 * If not specified, contents of the module will be directly exported into `'cc'`.
                 */
                ns?: string;
                /**
                 * If `true`, accesses the exports of this module from `'cc'` will be marked as deprecated.
                 */
                deprecated?: boolean;
            }>;
        }
        export type Test = string;
        /**
         * An engine feature.
         */
        export interface Feature {
            /**
             * Modules to be included in this feature in their IDs.
             * The ID of a module is its relative path(no extension) under /exports/.
             */
            modules: string[];
            /**
             * Flags to set when this feature is enabled.
             */
            intrinsicFlags?: Record<string, unknown>;
            /**
             * List of uuid that the feature depend on.
             */
            dependentAssets?: string[];
            /**
             * List of module that the feature depend on.
             */
            dependentModules?: string[];
            /**
             * Whether it is a native only feature, default is false.
             * @default false
             */
            isNativeOnly?: boolean;
        }
        export interface Context {
            mode?: string;
            platform?: string;
            buildTimeConstants?: object;
        }
        export type ConstantTypeName = "boolean" | "number";
        export interface IConstantInfo {
            /**
             * The comment of the constant.
             * Which is used to generate the consts.d.ts file.
             */
            readonly comment: string;
            /**
             * The type of the constant for generating consts.d.ts file.
             */
            readonly type: ConstantTypeName;
            /**
             * The default value of the constant.
             * It can be a boolean, number or string.
             * When it's a string type, the value is the result of eval().
             */
            value: boolean | string | number;
            /**
             * Whether exported to global as a `CC_XXXX` constant.
             * eg. WECHAT is exported to global.CC_WECHAT
             * NOTE: this is a feature of compatibility with Cocos 2.x engine.
             * Default is false.
             *
             * @default false
             */
            ccGlobal?: boolean;
            /**
             * Whether exported to developer.
             * If true, it's only exported to engine.
             */
            readonly internal: boolean;
            /**
             * Some constant can't specify the value in the Editor, Preview or Test environment,
             * so we need to dynamically judge them in runtime.
             * These values are specified in a helper called `helper-dynamic-constants.ts`.
             * Default is false.
             *
             * @default false
             */
            dynamic?: boolean;
        }
        export interface IConstantConfig {
            [ConstantName: string]: IConstantInfo;
        }
        export interface IOptimizeDecorators {
            /**
             * The decorators which should be optimized when they only decorate class fields.
             */
            fieldDecorators: string[];
            /**
             * The decorators which should be removed directly when they only work in Cocos Creator editor.
             */
            editorDecorators: string[];
        }
    }
    export interface ImportMap {
        imports?: Imports;
        scopes?: Record<string, Imports>;
    }
    export type Imports = Record<string, string>;
    export interface ImportRestriction {
        importerPatterns: string[];
        banSourcePatterns: string[];
    }
    export interface SharedSettings {
        useDefineForClassFields: boolean;
        allowDeclareFields: boolean;
        loose: boolean;
        guessCommonJsExports: boolean;
        exportsConditions: string[];
        importMap?: {
            json: ImportMap;
            url: string;
        };
        preserveSymlinks: boolean;
    }
    export interface EngineInfo {
        typescript: {
            type: "builtin" | "custom";
            custom: string;
            builtin: string;
            path: string;
        };
        native: {
            type: "builtin" | "custom";
            custom: string;
            builtin: string;
            path: string;
        };
    }
    export interface AssetChange {
        type: AssetChangeType;
        url: Readonly<URL>;
        uuid: UUID;
        isPluginScript: boolean;
        filePath: FilePath;
    }
    export enum AssetChangeType {
        add = 0,
        remove = 1,
        modified = 2
    }
    export interface AssetDatabaseDomain {
        /**
         * 此域的根 URL。
         */
        root: URL;
        /**
         * 此域的物理路径。
         */
        physical: string;
        /**
         * 此域的物理根路径。如果未指定则为文件系统根路径。
         * 在执行 npm 算法时会使用此字段。
         */
        jail?: string;
    }
    export type UUID = string;
    export type FilePath = string;
    export class QuickCompiler {
        constructor(options: QuickCompileOptions);
        build(): Promise<void>;
        buildImportMap(targetIndex: number, features: string[], configurableFlags: Record<string, unknown>): Promise<void>;
    }
    export interface QuickCompileOptions {
        rootDir: string;
        outDir: string;
        incrementalFile?: string;
        /**
         * 目标之间以什么样的方式运行编译：
         * - `par` 平行
         * - `seq` 顺序
         */
        targetLaunchPolicy?: "par" | "seq";
        targets: TargetOptions[];
        /**
         * 编译平台，有效值 'HTML5' 和 'NATIVE', 默认值是 'HTML5'。
         */
        platform?: Platform;
        /**
         * 日志文件。如未指定则直接输出到屏幕。
         */
        logFile?: string;
        onProgress?: (target: number, message: Readonly<ProgressMessage>) => void;
    }
    export interface TargetOptions extends SourceMapOptions {
        /**
         * 加到功能模块的前缀。
         */
        featureUnitPrefix?: string;
        /**
         * 是否包含引擎 `editor/exports` 下的模块。
         */
        includeEditorExports?: boolean;
        /**
         * `'cc'` 模块的内容。
         */
        includeIndex?: {
            features: string[];
        };
        /**
         * 输出目录。
         */
        dir: string;
        /**
         * 输出格式。
         */
        format: "commonjs" | "systemjs";
        /**
         * 宽松模式.
         */
        loose?: boolean;
        loader?: boolean;
        /**
         * BrowsersList targets.
         */
        targets?: string | string[] | Record<string, string>;
        perf?: boolean;
    }
    export type Platform = "HTML5" | "NATIVE";
    export interface SourceMapOptions {
        /**
         * 目标是 Electron 5.0.9 版本。
         */
        usedInElectron509?: boolean;
        /**
         * 使用内联的 source map。
         */
        inlineSourceMap?: boolean;
        /**
         * 使用索引 source map。
         */
        indexedSourceMap?: boolean;
    }
    export type ProgressMessage = TransformStageMessage | ExternalStageMessage | BundleStageMessage;
    export interface TransformStageMessage {
        stage: Stage.transform;
        /**
         * 总共多少个模块在编译。
         */
        total: number;
        /**
         * 已完成多少个模块的编译。
         */
        progress: number;
        /**
         * 触发 `total` 更新的文件。
         */
        file: string;
    }
    export interface ExternalStageMessage {
        stage: Stage.external;
    }
    export interface BundleStageMessage {
        stage: Stage.bundle;
    }
    export enum Stage {
        /**
         * 编译阶段。
         */
        transform = 0,
        /**
         * 处理外部依赖。
         */
        external = 1,
        /**
         * 打包。
         */
        bundle = 2
    }
    export interface buildProjRes {
        scriptPackages: string[];
        importMappings: Record<string, string>;
    }
    export interface IBuildScriptFunctionOption {
        /**
         * Are we in debug mode?
         */
        debug: boolean;
        /**
         * Whether to generate source maps or not.
         */
        sourceMaps: boolean;
        /**
         * Module format.
         */
        moduleFormat: ModuleFormat;
        /**
         * Module preservation.
         */
        modulePreservation: ModulePreservation;
        /**
         * !!Experimental.
         */
        transform: TransformOptions;
        /**
         * All sub-packages.
         */
        bundles: Array<Bundle>;
        /**
         * Root output directory.
         */
        commonDir: string;
        hotModuleReload: boolean;
        applicationJS: string;
        dbInfos: DBInfo[];
        uuidCompressMap: Record<string, string>;
        customMacroList: string[];
        ccEnvConstants: CCEnvConstants;
        /**
         * This option will bundle external chunk into each bundle's chunk in order to achieve the purpose of cross-project reuse of the bundle.
         * This will increase the size of the bundle and introduce the issue of chunk doppelganger, so use it with caution.
         * @default false
         */
        bundleCommonChunk?: boolean;
        cceModuleMap: Record<string, any>;
    }
    export type ModuleFormat = "esm" | "cjs" | "system" | "iife";
    /**
     *
     *
     * 模块保留选项。
     * - 'erase' 擦除模块信息。生成的代码中将不会保留模块信息。
     * - 'preserve' 保留原始模块信息。生成的文件将和原始模块文件结构一致。
     * - 'facade' 保留原始模块信息，将所有模块转化为一个 SystemJS 模块，但这些模块都打包在一个单独的 IIFE bundle 模块中。
     *   当这个 bundle 模块执行时，所有模块都会被注册。
     *   当你希望代码中仍旧使用模块化的特性（如动态导入、import.meta.url），但又不希望模块零散在多个文件时可以使用这个选项。
     */
    export type ModulePreservation = "erase" | "preserve" | "facade";
    export interface TransformOptions {
        /**
         * Babel plugins to excluded. Will be passed to as partial `exclude` options of `@babel/preset-env`.
         */
        excludes?: Array<string | RegExp>;
        /**
         * Babel plugins to included. Will be passed to as partial `include` options of `@babel/preset-env`.
         */
        includes?: Array<string | RegExp>;
        targets?: ITransformTarget;
    }
    export interface Bundle {
        id: string | null;
        scripts: IAssetInfo[];
        outFile: string;
    }
    export interface IAssetInfo {
        url: string;
        file: string;
        uuid: string;
    }
    export interface DBInfo {
        dbID: string;
        target: string;
    }
    export type CCEnvConstants = StatsQuery.ConstantManager.CCEnvConstants;
    export type ITransformTarget = string | string[] | Record<string, string>;
    export type BuildScriptCommand = (options: IBuildScriptFunctionOption & SharedSettings) => Promise<buildProjRes>;
    /**
     * Packer 驱动器。
     * - 底层用 QuickPack 快速打包模块相关的资源。
     * - 监听涉及到的所有模块变动并重进行打包，包括：
     *   - asset-db 代码相关资源的变动。
     *   - 引擎设置变动。
     * - 产出是可以进行加载的模块资源，包括模块、Source map等；需要使用 QuickPackLoader 对这些模块资源进行加载和访问。
     */
    export class PackerDriver {
        /**
         * 创建 Packer 驱动器。
         */
        static create(options: PackerDriverOptions): Promise<PackerDriver>;
        static getImportRestrictions(): ImportRestriction[];
        busy(): boolean;
        setAssetDatabaseDomains(assetDatabaseDomains: AssetDatabaseDomain[]): void;
        clearCache(): Promise<void>;
        getQuickPackLoaderContext(targetName: TargetName): QuickPackLoaderContext | undefined;
        isReady(targetName: TargetName): boolean | undefined;
        queryScriptDeps(scriptUrl: string): Promise<string[]>;
        shutDown(): Promise<void>;
        init(): Promise<void>;
        destroyed(): Promise<void>;
        get logger(): Logger;
        updateAssetChangeList(changes: ReadonlyArray<AssetChange>): void;
        triggerNextBuild(beforeBuildTask: () => void): void;
        /**
         * 请求一次构建，如果正在构建，会和之前的请求合并。
         */
        waitUnitlBuildFinish(): Promise<void>;
        /**
         * 请求一次构建，如果正在构建，会和之前的请求合并。
         */
        dispatchBuildRequest(): void;
        getCCEModuleIDs(): string[];
        /**
         * 当引擎功能变动后。
         */
        notifyEngineFeaturesChanged(): void;
    }
    export interface PackerDriverOptions {
        workspace: string;
        projectPath: string;
        engineInfo: EngineInfo;
        cceModuleMap: CCEModuleMap;
        callbacks: IPackerDriverCallbacks;
    }
    export interface IPackerDriverCallbacks {
        onQueryEditorPatterns(): Promise<string[]>;
        onQueryIncludeModules(): Promise<string[]>;
        onQuerySharedSettings(logger: Logger): Promise<SharedSettings>;
        onCompressUUID(uuid: string, min: boolean): string;
        onBeforeBuild(changes: AssetChange[]): Promise<void>;
        onTransformFilePathToDbPath(filePath: string): Promise<string | null | undefined>;
        onInit(): Promise<void>;
        onDestroy(): Promise<void>;
    }
    export type CCEModuleMap = {
        [moduleName: string]: CCEModuleConfig;
    } & {
        mapLocation: string;
    };
    export type TargetName = string;
    export interface CCEModuleConfig {
        description: string;
        main: string;
        types: string;
    }
    export type Logger = {
        debug: LeveledLogMethod;
        info: LeveledLogMethod;
        warn: LeveledLogMethod;
        error: LeveledLogMethod;
    };
    export type LeveledLogMethod = (message: string) => void;
    export class QuickPackLoader {
        constructor(context: QuickPackLoaderContext, options?: IQuickPackOptions);
        get importMapURL(): string;
        get resolutionDetailMapURL(): string;
        lock(): Promise<void>;
        unlock(): Promise<void>;
        loadAny(url: string): Promise<{
            type: "json";
            json: unknown;
        } | {
            type: "chunk";
            chunk: ChunkInfo;
        }>;
        /**
         * Loads the import map.
         * @returns The import map object.
         */
        loadImportMap(): Promise<ImportMap>;
        /**
         * Loads the resolution detail map.
         * @returns The resolution detail map object.
         */
        loadResolutionDetailMap(): Promise<ResolutionDetailMap>;
        /**
         * Load specific chunk.
         * @param url The URL of the chunk, if relative, would be resolved from `this.baseURL`.
         * @returns The chunk info.
         */
        loadChunk(url: string): Promise<ChunkInfo>;
        /**
         * Gets the opacity, unique ID of the chunk, to query timestamp or load the chunk.
         * @param url URL of the chunk.
         * @returns The chunk ID.
         */
        getChunkId(url: string): string;
        /**
         * Load specific chunk.
         * @param id The chunk ID.
         * @returns The chunk ID.
         */
        loadChunkFromId(id: ChunkId): Promise<ChunkInfo>;
        /**
         * 获取指定资源的 mtime 时间戳。若不存在则返回负值。
         */
        queryTimestamp(resource: ChunkId): Promise<ChunkTimestamp>;
        /**
         * 获取指定所有资源的 mtime 时间戳。不存在的资源将返回负值。
         */
        queryTimestamps(resources: ChunkId[]): Promise<ChunkTimestamp[]>;
        reload(): Promise<void>;
    }
    export class QuickPackLoaderContext {
        constructor(workspace: string);
        workspace: string;
        serialize(): SerializedLoaderContext;
        static deserialize(serialized: SerializedLoaderContext): QuickPackLoaderContext;
    }
    export interface IQuickPackOptions {
    }
    export interface ChunkInfo {
        type: "file";
        path: string;
    }
    export interface SerializedLoaderContext {
        workspace: string;
    }
    export type ChunkId = string;
    export interface ResolutionDetailMap {
        [importer: string]: {
            [specifier: string]: NotableResolutionDetail;
        };
    }
    export type ChunkTimestamp = number;
    export interface NotableResolutionDetail {
        /**
         * The error text if this resolution issues an error.
         */
        error?: string;
        /**
         * The other messages.
         */
        messages?: ChunkMessage[];
    }
    export interface ChunkMessage {
        level: "log" | "warn" | "error";
        text: string;
    }
    export class Executor {
        static create(options: Executor.Options): Promise<Executor>;
        addPolyfillFile(file: string): void;
        prepare(): Promise<void>;
        import(url: string): Promise<unknown>;
        /**
         * 重新读取 Packer 的内容并重新执行所有项目脚本和插件脚本。
         */
        reload(): Promise<void>;
        /**
         * 热更脚本插件
         * @param info 脚本插件更新信息
         */
        hotReloadPluginScripts(info?: IPluginChangedInfo): Promise<void>;
        isModule(id: string): boolean;
        clear(): Promise<void>;
        setPluginScripts(plugins: PluginScriptInfo[]): void;
        /**
         * 查找指定脚本模块中注册的所有 cc 类。
         * @param uuid 模块的 uuid。
         * @returns 指定脚本模块中注册的所有 cc 类；如果 [uuid] 并不对应一个模块或模块中未注册任何类则返回 `undefined`。
         */
        queryClassesInModule(uuid: string): undefined | ReadonlyArray<Readonly<Function>>;
    }
    export namespace Executor {
        export type BeforeUnregisterClass = (classConstructor: Function) => void;
        export interface ReporterMap {
            ["possible-cr-use"]: {
                imported: string;
                moduleRequest: string;
                importMeta: any;
                extras: any;
            };
        }
        export type Logger = Partial<{
            possibleCircularReference: (imported: string, moduleRequest: string, importMeta: any, extras: any) => void;
            loadException: (moduleUrl: string, error?: any, hasBeenThrown?: boolean) => void;
        }>;
        export interface Options {
            projectPath: string;
            importEngineMod: ImportEngineMod;
            quickPackLoaderContext: QuickPackLoaderContext;
            beforeUnregisterClass?: BeforeUnregisterClass;
            packModuleEvaluator?: PackModuleEvaluator;
            logger?: Logger;
            importExceptionHandler?: (err: unknown) => void;
            cceModuleMap: Record<string, any>;
        }
        export interface ExecuteInfo {
            polyfills: string[];
            modules: string[];
            bareSpecifierResolveMap: Record<string, string>;
            instantiateMap: Record<string, string>;
        }
    }
    export type ImportEngineMod = (id: string) => Record<string, unknown> | Promise<Record<string, unknown>>;
    export interface PackModuleEvaluator {
        evaluate(file: string): void | Promise<void>;
    }
    /**
     * 脚本插件更新信息，changes 中包含添加与修改的插件，removals 中包含删除的插件
     */
    export interface IPluginChangedInfo {
        /**
         * 所有要修改的（或新增的）插件脚本。
         */
        changes: Record<PluginScriptId, PluginScriptInfo>;
        /**
         * 所有要移除的插件脚本。
         */
        removals: PluginScriptId[];
    }
    export interface PluginScriptInfo {
        /**
         * 脚本文件。
         */
        file: string;
        uuid: string;
    }
    /**
     * `BuiltinModuleProvider` 用于提供项目脚本用到的所有“内置”模块，例如：
     * - `"cc.base"` 等引擎模块
     * - 模块 `"cc/env"` —— 提供了构建时常量
     *
     * 它提供的内置模块可以用于在**编辑器环境**中、**预览环境**中以及**构建时打包工具**的环境中运行。
     */
    export class BuiltinModuleProvider {
        static create(options: BuiltinModuleOptions): Promise<BuiltinModuleProvider>;
        /**
         * 添加 `'cc'` 模块。
         * @param mods `'cc'` 模块导出的所有子模块。
         */
        addEngineIndexMod(mods: string[]): Promise<void>;
        addEngineIndexMod(url: string, xSourceKind?: TargetKind): Promise<void>;
        addEngineMods(ccMods: Record<string, string>, xSourceKind?: TargetKind): Promise<void>;
        /**
         * 添加 `'cc/env'` 模块。
         * @param constants `'cc/env'` 模块中的常量以及它们的值。
         */
        addBuildTimeConstantsMod(constants: Record<string, IBuildTimeConstantValue>): Promise<void>;
        /**
         * 添加 `'cc/env'` 模块。让 `'cc/env'` 映射为指定的模块.
         * @param url 指定的模块。若未指定则为 `this.getBTCMappingSource()`。
         * @param xSourceKind 指定模块的格式。
         */
        addBuildTimeConstantsMod(url?: string, xSourceKind?: TargetKind): Promise<void>;
        getBTCMappingSource(): string;
        /**
         * 当前提供的所有模块以及它们的源码。
         */
        get modules(): Readonly<Record<string, string>>;
    }
    export type PluginScriptId = string;
    export interface BuiltinModuleOptions {
        /**
         * `BuiltinModuleProvider` 中提供的模块的格式。
         */
        format?: "systemjs" | "esm";
    }
    /**
     * 很多时候 `BuiltinModuleProvider` 中的模块需要映射到其它模块。
     * `TargetKind` 代表了目标模块的模块格式。
     */
    export type TargetKind = "commonjs" | "amd";
    export type IBuildTimeConstantValue = string | number | boolean;
    export interface BuildSystemJsOptions {
        out: string;
        sourceMap: boolean;
        minify: boolean;
        preset: "web" | "commonjs-like" | "node" | "core";
        runInBrowserEnv: boolean;
        format?: "iife" | "commonjs";
        hmr?: boolean;
        editor?: boolean;
        libprogramming?: boolean;
        quickBuildEngine?: boolean;
        inlineDynamicImports?: boolean;
        output?: OutputOptions;
    }
    export interface OutputOptions {
        banner?: string | (() => string | Promise<string>);
        footer?: string | (() => string | Promise<string>);
        exports?: "default" | "named" | "none" | "auto";
    }
    export type BuildSystemJsFunc = (options: BuildSystemJsOptions) => Promise<void>;
    export interface BuildPolyfillsOptions {
        file: string;
        sourceMap?: boolean;
        debug?: boolean;
        coreJs?: boolean | Omit<CoreJSBuilderOptions, "filename">;
        asyncFunctions?: boolean;
        fetch?: boolean;
    }
    export interface CoreJSBuilderOptions {
        modules?: string[];
        blacklist?: string[];
        targets?: string;
        filename: string;
    }
    export type BuildPolyFillsFunc = (options: BuildPolyfillsOptions) => Promise<boolean>;
    export {};
}
