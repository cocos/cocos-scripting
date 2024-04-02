import './hook';
import { reload } from './hot';
import type { ImportContext, ModuleMap } from '../globals';
import { systemJSPrototype } from '../globals';

let _defaultHotupdatable = true;

systemJSPrototype.reload = function(files: string[]) {
    return reload(files);
};

systemJSPrototype.setDefaultHotReloadable = function (value: boolean) {
    _defaultHotupdatable = value;
};

systemJSPrototype.getDefaultHotReloadable = function (): boolean {
    return _defaultHotupdatable;
};

type ClassName = string;
type Class = Object;
type Name2Class = Record<ClassName, Class>;

const upvalueMap: ModuleMap = {};
const vendorCreateContext = systemJSPrototype.createContext;
systemJSPrototype.createContext = function (id: string): ImportContext {
    const name2class: Name2Class = {};
    const context = vendorCreateContext.call(this, id);
    upvalueMap[context.url] = name2class;
    return {
        ...context,
        upvalue (name: string) {
            return function (target: any) {
                name2class[name] = target;
            }
        }
    };
}

const vendorEntries = systemJSPrototype.entries;
systemJSPrototype.entries = function () {
    const entries = vendorEntries.call(this);
    const vendorNext = entries.next;
    entries.next = function () {
        const next = vendorNext.call(this);
        if (!next.done) {
            const [id] = next.value;
            next.value.push(upvalueMap[id]);
        }
        return next;
    };
    return entries;
}

export { reload } from './hot.js';