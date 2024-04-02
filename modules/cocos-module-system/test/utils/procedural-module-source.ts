
export enum EventType {
    EXECUTION = 'execution',
    DISPOSE = 'dispose',
    DEPENDENCY_ACCEPT = 'dependency-accept',
    DEPENDENCY_ACCEPT_ERROR = 'dependency-accept-error',
    SELF_ACCEPT_ERROR = 'self-accept-error',
}

export const sourceOfEventType = (eventType: EventType) => `'${eventType}'`;

export const sourceOfNotifyExecution = `
    import.meta.notify(${sourceOfEventType(EventType.EXECUTION)});
    `;

export const sourceOfInvokeDispose = `
    import.meta.ccHot.dispose((_data) => {
        import.meta.notify(${sourceOfEventType(EventType.DISPOSE)});
    });
    `;

export const sourceOfReportDependencyAccept = (
    dependencies: string | string[],
    update: boolean = true,
    error: boolean = true,
) => `
import.meta.ccHot.accept(
    ${Array.isArray(dependencies)
        ? `[${dependencies.map((dep) => `'${dep}'`).join(', ')}]`
        : `'${dependencies}'`},
    ${update ? `() => { import.meta.notify(${sourceOfEventType(EventType.DEPENDENCY_ACCEPT)}); }` : '() => {}'},
    ${error ? `() => { import.meta.notify(${sourceOfEventType(EventType.DEPENDENCY_ACCEPT_ERROR)}); },` : ''}
);
`;

export const sourceOfReportDependencyAcceptUpdate = (dependencies: string | string[]) =>
    sourceOfReportDependencyAccept(dependencies, true, false);

export const sourceOfSelfAccept = `
import.meta.ccHot.accept();
`;

export const sourceOfReportSelfAcceptError = `
import.meta.ccHot.accept((_err) => {
    import.meta.notify(${sourceOfEventType(EventType.SELF_ACCEPT_ERROR)});
});
`;

export const makeEvent = (eventType: EventType, url: string) => {
    return `${eventType} ${url}`;
};
