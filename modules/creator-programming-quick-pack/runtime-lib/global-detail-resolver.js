
import { systemJSPrototype } from 'systemjs-source/system-core';
import { createDetailResolver, setResolutionDetailMap } from './detail-resolver.js';

const resolve = createDetailResolver();

const vendorResolve = systemJSPrototype.resolve;
systemJSPrototype.resolve = function (specifier, importer) {
    void resolve(specifier, importer);
    return vendorResolve.apply(this, arguments);
};

export { setResolutionDetailMap };
