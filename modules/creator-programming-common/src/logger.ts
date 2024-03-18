
export type Logger = {
    debug: LeveledLogMethod;
    info: LeveledLogMethod;
    warn: LeveledLogMethod;
    error: LeveledLogMethod;
};

type LeveledLogMethod = (message: string) => void;

export function createLogger(options: {}): Logger {
    return {
        debug: console.debug.bind(console),
        info: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
    };
}
