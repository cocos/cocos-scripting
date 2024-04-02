import { systemJSPrototype } from './globals';
import { resolveIfNotPlainOrUrl, hasSymbol } from '../systemjs/src/common.js';

let resolutionDetailMap = {};

function createDetailResolver() {
    const logger = (message) => {
        let log;
        switch (message.level) {
            default:
            case 'log': log = console.log; break;
            case 'warn': log = console.warn; break;
            case 'error': log = console.error; break;
        }
        log.call(console, message.text);
    };

    return function resolve(specifier, importer) {
        return new Promise((resolve, reject) => {
            const detail = resolutionDetailMap[importer]?.[specifier];
            if (!detail) {
                resolve();
                return;
            }
        
            const { error, messages } = detail;
        
            if (messages) {
                for (const message of messages) {
                    logger(message);
                }
            }
        
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    };
}

function setResolutionDetailMap (map, mapUrl) {
    resolutionDetailMap = {};
    for (const [moduleUrl, _] of Object.entries(map)) {
        const normalized = resolveIfNotPlainOrUrl(moduleUrl, mapUrl);
        resolutionDetailMap[normalized] = _;
    }
}


const setResolutionDetailMapCallbackTag = hasSymbol ? Symbol('[[setResolutionDetailMapCallback]]') : 'setResolutionDetailMapCallback';

// @ts-ignore for editor only
systemJSPrototype.setResolutionDetailMapCallback = function (callback) {
    // @ts-ignore for editor only
    this[setResolutionDetailMapCallbackTag] = callback;
};

let setupResolutionDetailMapPromise = null;

const vendorPrepareImport = systemJSPrototype.prepareImport;
systemJSPrototype.prepareImport = async function () {
    if (!setupResolutionDetailMapPromise) {
        setupResolutionDetailMapPromise = (async () => {
            try {
                await (async () => {
                    // @ts-ignore for editor only
                    const { json, url } = await this[setResolutionDetailMapCallbackTag]();
                    setResolutionDetailMap(json, url);
                })();
            } catch (err) {
                console.debug(`Failed to load resolution detail map: ${err}`);
            }
        })();
    }

    await setupResolutionDetailMapPromise;

    vendorPrepareImport.apply(this, arguments);
};

const resolveDetailMap = createDetailResolver();

const vendorResolve = systemJSPrototype.resolve;
systemJSPrototype.resolve = function (specifier, importer) {
    return resolveDetailMap(specifier, importer).then(() => {
        return vendorResolve.apply(this, arguments);
    });
};

export {}