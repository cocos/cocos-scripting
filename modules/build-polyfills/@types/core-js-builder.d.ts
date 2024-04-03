
declare module "core-js-builder" {
    function $(options: $.Options): Promise<string>;

    namespace $ {
        export interface Options {
            modules?: string[];
            blacklist?: string[];
            targets?: string;
            filename: string;
        }
    }

    export default $;
}