import winston from 'winston';
import { Logger } from '@cocos/creator-programming-common';
// import { getGlobal } from '@electron/remote';
// const remoteEditor = getGlobal('Editor');

const packerDriverLogTag = '::PackerDriver::';
const packerDriverLogTagRegex = new RegExp(packerDriverLogTag);
const packerDriverLogTagHidden = `{hidden(${packerDriverLogTag})}`;

export class PackerDriverLogger implements Logger {
    constructor(debugLogFile: string) {
        const fileLogger = winston.createLogger({
            transports: [
                new winston.transports.File({
                    level: 'debug',
                    filename: debugLogFile,
                    format: winston.format.combine(
                        winston.format.timestamp({ format: 'HH:mm:ss' }),
                        winston.format.printf(({ level, message, timestamp }) => {
                            return `${timestamp} ${level}: ${message}`;
                        })
                    ),
                }),
            ],
        });
        this._fileLogger = fileLogger;
    }

    debug(message: string): this {
        this._fileLogger.debug(message);
        return this;
    }

    info(message: string): this {
        this._fileLogger.info(message);
        console.info(packerDriverLogTagHidden, message);
        return this;
    }

    warn(message: string): this {
        this._fileLogger.warn(message);
        console.warn(packerDriverLogTagHidden, message);
        return this;
    }

    error(message: string): this {
        this._fileLogger.error(message);
        console.error(packerDriverLogTagHidden, message);
        return this;
    }

    clear(): void {
        console.debug('Clear logs...');
        //TODO(cjh): remoteEditor.Logger.clear(packerDriverLogTagRegex);
    }

    private _fileLogger: winston.Logger;
}
