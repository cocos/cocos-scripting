
export function launchSequentially<T, U>(tasks: T[], fn: (value: T, index: number) => U | Promise<U>): Promise<U[]> {
    const nTasks = tasks.length;
    const results = new Array<U>(nTasks);
    return (async () => {
        for (let iTask = 0; iTask < nTasks; ++iTask) {
            results[iTask] = await fn(tasks[iTask], iTask);
        }
        return results;
    })();
}

export function sequenceDiscarding<T>(tasks: T[], fn: (value: T, index: number) => unknown): Promise<unknown> {
    return tasks.reduce((promise: Promise<unknown>, task, currentIndex) => promise.then(() => fn(task, currentIndex)), Promise.resolve());
}

export function parallelDiscarding<T, U>(tasks: T[], fn: (value: T, index: number) => U | Promise<U>): Promise<U[]> {
    return Promise.all(tasks.map((task, index) => fn(task, index)));
}
