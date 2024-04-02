import { ImportContext, systemJSPrototype } from '../globals';
import { ModuleSystem } from './module-system';

const vendorCreateContext = systemJSPrototype.createContext;
systemJSPrototype.createContext = function(id: string): ImportContext {
    const context = vendorCreateContext.call(this, id);
    return {
        ...context,
        moduleSystem: ModuleSystem.getInstance(),
    };
};