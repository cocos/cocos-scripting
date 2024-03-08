
declare module "browserify-incremental" {
    import browserify from 'browserify';

    interface IncrementalOptions {
        cacheFile?: string;
    }

    interface BrowserifyIncrementalConstructor {
        (files: browserify.InputFile[], opts?: BrowserifyIncrementalConstructor.Options): browserify.BrowserifyObject;
        (file: browserify.InputFile, opts?: BrowserifyIncrementalConstructor.Options): browserify.BrowserifyObject;
        (opts?: BrowserifyIncrementalConstructor.Options): browserify.BrowserifyObject;
        new(files: browserify.InputFile[], opts?: BrowserifyIncrementalConstructor.Options): browserify.BrowserifyObject;
        new(file: browserify.InputFile, opts?: BrowserifyIncrementalConstructor.Options): browserify.BrowserifyObject;
        new(opts?: BrowserifyIncrementalConstructor.Options): browserify.BrowserifyObject;
    }

    function BrowserifyIncrementalConstructor(instance: browserify.BrowserifyObject, options: IncrementalOptions): browserify.BrowserifyObject;

    namespace BrowserifyIncrementalConstructor {
        export type Options = browserify.Options & IncrementalOptions;

        export const args: {
            cache: {},
            packageCache: {},
            fullPaths: true,
        };
    }

    export = BrowserifyIncrementalConstructor;
}