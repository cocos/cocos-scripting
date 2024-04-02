import { systemJSPrototype } from './globals';
import type { ImportContext } from './globals';

const vendorCreateContext = systemJSPrototype.createContext;
systemJSPrototype.createContext = function (id: string): ImportContext {
    const context = vendorCreateContext.call(this, id);
    context.upvalue = context.upvalue || function (name: string) {
        return function (target) { }
    }
    return context;
}