import { ImportMap } from './import-map';

export interface SharedSettings {
    useDefineForClassFields: boolean;
    allowDeclareFields: boolean;
    loose: boolean;
    guessCommonJsExports: boolean;
    exportsConditions: string[];
    importMap?: {
        json: ImportMap;
        url: string;
    };
    preserveSymlinks: boolean;
}
