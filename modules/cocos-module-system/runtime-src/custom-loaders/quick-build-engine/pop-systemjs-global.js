
import { System as pushedSystem } from './push-systemjs-global';
const currentSystem = globalThis.System;
globalThis.System = pushedSystem;
export { currentSystem as System };
