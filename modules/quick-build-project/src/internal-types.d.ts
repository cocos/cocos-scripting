export declare namespace Editor {

    export namespace Profile {
        export type PreferencesProtocol = 'default' | 'global' | 'local';
        export type ProjectProtocol = 'default' | 'project';

        /**
         * @zh 读取插件配置
         * @en Read plugin configuration
         * @param name 插件名 The plugin name
         * @param key 配置路径 Configure path
         * @param type 配置的类型，选填 Type of configuration, optional(global,local,default)
         */
        export function getConfig(name: string, key?: string, type?: PreferencesProtocol): Promise<any>;
        /**
         * @zh 设置插件配置
         * @en Set plugin configuration
         * @param name 插件名 The plugin name
         * @param key 配置路径 Configure path
         * @param value 配置的值 The value of the configuration
         * @param type 配置的类型，选填 Type of configuration, optional(global,local,default)
         */
        export function setConfig(name: string, key: string, value: Editor.Profile.ProfileValueType, type?: PreferencesProtocol): Promise<void>;

        /**
         * @zh 读取插件内的项目配置
         * @en Read project configuration from the plugin
         * @param name 插件名 The plugin name
         * @param key 配置路径 Configure path
         * @param type 配置的类型，选填 Type of configuration, optional(project,default)
         */
        export function getProject(name: string, key?: string, type?: ProjectProtocol): Promise<any>;
    }

    export namespace Message {
        /**
         * @zh 广播一个消息
         * @en Broadcast a message
         * @param message 触发消息的名字 The name of the triggered message
         * @param args 消息需要的参数 The parameters required by the message
         */
        export function broadcast(message: string, ...args: (string | number | boolean | undefined | null | { [key: string]: any } | (string | number | boolean)[])[]): void;
    }

    export namespace Metrics {
        /**
         * 开始追踪时间
         * @param message
         */
        export function trackTimeStart(message: string): void;
        /**
         * 结束追踪时间
         * @param message
         * @param options 输出选项 { output：是否 console.debug 打印; label: 打印的消息名词的替换文本，支持 i18n: 写法; value: 直接打印计算好的统计时间}
         * @return 返回统计时间
         */
        export function trackTimeEnd(message: string, options?: { output?: boolean, label?: string, value?: number }): Promise<number>;

    }

    export namespace UI {
        export const __protected__: {
            File: {
                resolveToRaw(url: string): string;
            }
        };
    }
}