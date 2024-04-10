import { AssertionError } from 'assert';

export function asserts(expr: unknown, message?: string): asserts expr is true {
    if (!expr) {
        throw new AssertionError({ message });
    }
}

export function assertsIsFalse(expr: unknown, message?: string): asserts expr is false {
    if (expr) {
        throw new AssertionError({ message });
    }
}

export function assertsNonNullable<T>(expr: T, message?: string): asserts expr is NonNullable<T> {
    asserts(!(expr === null || expr === undefined), message);
}
