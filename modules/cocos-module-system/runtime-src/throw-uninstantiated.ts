import { systemJSPrototype } from './globals';

systemJSPrototype.instantiate = function(url: string, firstParentUrl: string) {
    throw new Error(`Unable to instantiate ${url} from ${firstParentUrl}`);
};