import { PackModuleEvaluator } from "../../src/executor/pack-mod-instantiation";
import fs from 'fs-extra';

export function createPackModuleEvaluator(): PackModuleEvaluator {
    return {
        evaluate(file) {
            const code = fs.readFileSync(file, { encoding: 'utf-8' });
            new Function(code)();
        },
    };
}

export function createDummyEngineIndexModule() {
    return {
        cclegacy: {
            _RF: {
                reset() {
                },
            },
        },
    };
}
