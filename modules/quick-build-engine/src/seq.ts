


export function sequenceDiscarding<T>(tasks: T[], fn: (value: T, index: number) => unknown): Promise<unknown> {
    return tasks.reduce((promise: Promise<unknown>, task, currentIndex) => promise.then(() => fn(task, currentIndex)), Promise.resolve());
}

export function parallelDiscarding<T>(tasks: T[], fn: (value: T, index: number) => unknown): Promise<unknown> {
    return Promise.all(tasks.map((task, index) => fn(task, index)));
}
