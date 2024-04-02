
import { systemJSPrototype } from '../globals';
import { createHotMeta, setDependencies } from './hot';

const vendorCreateContext = systemJSPrototype.createContext;
systemJSPrototype.createContext = function(...args: [string]) {
    const [url] = args;
    return {
        ...vendorCreateContext.apply(this, args),
        ccHot: createHotMeta(url),
    };
};

const vendorOnLoad = systemJSPrototype.onload;
systemJSPrototype.onload = function(...args: [unknown, string, string[]]) {
    const [err, id, dependencies] = args;
    setDependencies(err, id, dependencies);
    vendorOnLoad.apply(this, args);
};
