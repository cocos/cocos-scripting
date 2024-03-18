
import { Base } from './mod.mjs';

export class Derived extends Base {
    constructor () {
        super();
        console.log(`Derived`);
    }
}