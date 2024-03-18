
import { Logger } from '@cocos/creator-programming-common/lib/logger';

const debugLog: Logger['debug'] = () => {};

const infoLog: Logger['info'] = console.info.bind(console);

const warnLog: Logger['warn'] = console.warn.bind(console);

const errorLog: Logger['error'] = console.error.bind(console);

export const unitTestLogger: Logger = {
    debug: debugLog,
    info: infoLog,
    warn: warnLog,
    error: errorLog,
};

export function spyOnDebugLog () {
    return jest.spyOn(unitTestLogger, 'debug').mockImplementation();
}

export function spyOnInfoLog () {
    return jest.spyOn(unitTestLogger, 'info').mockImplementation();
}

export function spyOnWarnLog () {
    return jest.spyOn(unitTestLogger, 'warn').mockImplementation();
}

export function spyOnErrorLog () {
    return jest.spyOn(unitTestLogger, 'error').mockImplementation();
}
