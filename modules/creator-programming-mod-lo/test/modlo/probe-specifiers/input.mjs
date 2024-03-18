import 'a';
import { B } from 'b';
import C from 'c';
import * as D from 'd';
export { E } from 'e';
export * as F from 'f';
import('g');
import("h");
import(`i`);
// Prevent from removing
console.log(
    B, C, D,
);

