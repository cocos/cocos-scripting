import warmup from './warmup-commonjs-like';
import { systemJSPrototype } from '../globals';
systemJSPrototype.prepareImport = function () { return Promise.resolve(); }

// @ts-ignore this should be a private interface
systemJSPrototype.warmup = warmup;
