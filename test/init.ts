import { setupQuickPackTestEnv } from '@cocos/creator-programming-quick-pack/test/setup-file';

setupQuickPackTestEnv();

console.log = jest.fn();
console.warn = jest.fn();
// console.error = jest.fn();
console.debug = jest.fn();
console.time = jest.fn();
console.timeEnd = jest.fn();
