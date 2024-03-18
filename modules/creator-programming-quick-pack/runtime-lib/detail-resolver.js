
import {
    resolveIfNotPlainOrUrl,
} from './resolve-if-not-plain-url.js';

/**
 * @type {import('../lib/resolution-detail-map').ResolutionDetailMap}
 */
let resolutionDetailMap = {};

export function createDetailResolver(logger, rejector) {
    logger ??= (message) => {
        let log;
        switch (message.level) {
            default:
            case 'log': log = console.log; break;
            case 'warn': log = console.warn; break;
            case 'error': log = console.error; break;
        }
        log.call(console, message.text);
    };

    rejector ??= (text) => {
        throw new Error(text);
    };

    return function resolve(specifier, importer) {
        const detail = resolutionDetailMap[importer]?.[specifier];
        if (!detail) {
            return;
        }
    
        const { error, messages } = detail;
    
        if (messages) {
            for (const message of messages) {
                logger(message);
            }
        }
    
        if (error) {
            rejector(error);
        }
    };
}

export function setResolutionDetailMap (map, mapUrl) {
    resolutionDetailMap = {};
    for (const [moduleUrl, _] of Object.entries(map)) {
        const normalized = resolveIfNotPlainOrUrl(moduleUrl, mapUrl);
        resolutionDetailMap[normalized] = _;
    }
}
