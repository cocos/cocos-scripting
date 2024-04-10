
import resolve from 'resolve';
import { URL, fileURLToPath, pathToFileURL } from 'url';
import ps from 'path';
import { hasFileProtocol, asserts } from '@ccbuild/utils';
import { CjsModuleNotFileError, ModuleNotFoundError } from './resolve-error';
import { isNodeJsBuiltinModule, toNodeProtocolUrl } from '../utils/node-builtins';

export async function cjsResolve(specifier: string, parentURL: URL): Promise<URL> {
    if (!hasFileProtocol(parentURL)) {
        throw new CjsModuleNotFileError(parentURL);
    }

    const parentPath = fileURLToPath(parentURL);
    const basedir = ps.dirname(parentPath);
    const resolveOpts: resolve.AsyncOpts = {
        basedir,
        includeCoreModules: false,
    };

    const resolved = await new Promise<URL>((done, rejected) => {
        resolve(specifier, resolveOpts, (err, resolved, _pkg) => {
            if (err) {
                if (isNodeJsBuiltinModule(specifier)) {
                    done(new URL(toNodeProtocolUrl(specifier)));
                }
                
                rejected(new ModuleNotFoundError(specifier, parentURL));
            } else {
                asserts(resolved);
                const resolvedUrl = pathToFileURL(resolved);
                done(resolvedUrl);
            }
        });
    });
    
    return resolved;
}
