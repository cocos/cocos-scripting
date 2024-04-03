/* eslint-disable camelcase */

import { Env } from './utils/env';
import dedent from 'dedent';
import { EventType, makeEvent, sourceOfEventType, sourceOfInvokeDispose, sourceOfNotifyExecution, sourceOfReportDependencyAccept, sourceOfReportDependencyAcceptUpdate, sourceOfReportSelfAcceptError, sourceOfSelfAccept } from './utils/procedural-module-source';

class Notifier {
    constructor(env: Env) {
        env.injectModuleMeta(this._meta.bind(this));
    }

    get events(): readonly string[] {
        return this._events;
    }

    get data(): Readonly<any> {
        return this._data;
    }

    clear() {
        this._events.length = 0;
        for (const propertyKey of Object.getOwnPropertyNames(this._data)) {
            delete (this._data as any)[propertyKey];
        }
    }

    private _data = {};

    private _events: string[] = [];

    private _meta(_id: string) {
        const data_ = this._data;
        const events = this._events;

        return {
            data: data_,

            notify: function notify(this: ImportMeta, eventType: EventType) {
                events.push(makeEvent(eventType, this.url));
            },
        };
    }
}

test('HMR', async () => {
    const env = new Env();
    const { virtualModules } = env;
    const notifier = new Notifier(env);

    const b = (() => {
        let current = 0;
        return {
            expected() {
                return current;
            },
            next() {
                ++current;
                return dedent`
                export const v = ${current};
                export function count() { }
                `;
            },
        };
    })();

    const nextChainHeadSource = () => dedent`
    import './child.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    ${b.next()}
    `;

    virtualModules.add('main.js', dedent`
    import './grandparent.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    import.meta.ccHot.accept();
    `);

    virtualModules.add('grandparent.js', dedent`
    import './parent.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    `);

    virtualModules.add('parent.js', dedent`
    import { v, count } from './chain-head.js';
    import './sibling.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    import.meta.data.v_in_a_import_from_b = v;
    count();
    `);

    virtualModules.add('chain-head.js', nextChainHeadSource());

    virtualModules.add('sibling.js', dedent`
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    `);

    virtualModules.add('child.js', dedent`
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    `);

    // First load
    await env.importVirtualModule('main.js');
    expect(notifier.data.v_in_a_import_from_b).toBe(b.expected());

    // Reload
    notifier.clear();
    virtualModules.add('chain-head.js', nextChainHeadSource());
    await env.reloadVirtualModules(['chain-head.js']);
    expect(notifier.events).toStrictEqual([
        makeEvent(EventType.DISPOSE, env.vmURL`chain-head.js`),
        makeEvent(EventType.DISPOSE, env.vmURL`parent.js`),
        makeEvent(EventType.DISPOSE, env.vmURL`grandparent.js`),
        makeEvent(EventType.DISPOSE, env.vmURL`main.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`chain-head.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`parent.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`grandparent.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`main.js`),
    ]);
    expect(notifier.data.v_in_a_import_from_b).toBe(b.expected());

    // notifier.clear();
});

test('Bindings update', async () => {
    const env = new Env();
    const { virtualModules } = env;
    const notifier = new Notifier(env);

    const volatileBindingModule = new VolatileBindingModule();

    virtualModules.add('importer.js', dedent`
    import { ${volatileBindingModule.bindingNamesAsImportClause()} } from './dependency.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    const report = () => {
        import.meta.data.result = [${volatileBindingModule.bindingNames().map((bindingName) => bindingName).join(', ')}];
    };
    report();
    import.meta.ccHot.accept('./dependency.js', () => {
        import.meta.notify(${sourceOfEventType(EventType.DEPENDENCY_ACCEPT)});
        report();
    });
    `);

    const nextDependencySource = () => dedent`
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    ${volatileBindingModule.next()}
    `;

    virtualModules.add('dependency.js', nextDependencySource());

    await env.importVirtualModule('importer.js');
    expect(notifier.events).toStrictEqual([
        makeEvent(EventType.EXECUTION, env.vmURL`dependency.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`importer.js`),
    ]);
    expect(notifier.data.result).toStrictEqual(volatileBindingModule.expected());

    notifier.clear();
    virtualModules.add('dependency.js', nextDependencySource());
    await env.reloadVirtualModules(['dependency.js']);
    expect(notifier.events).toStrictEqual([
        makeEvent(EventType.DISPOSE, env.vmURL`dependency.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`dependency.js`),
        makeEvent(EventType.DEPENDENCY_ACCEPT, env.vmURL`importer.js`),
    ]);
    expect(notifier.data.result).toStrictEqual(volatileBindingModule.expected());
});

test('Self accept', async () => {
    const env = new Env();
    const { virtualModules } = env;
    const notifier = new Notifier(env);

    virtualModules.add('main.js', dedent`
    import './importer.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    `);

    virtualModules.add('importer.js', dedent`
    import './dependency.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    ${sourceOfSelfAccept}
    `);

    const nextDependencySource = () => dedent`
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    `;

    virtualModules.add('dependency.js', nextDependencySource());

    await env.importVirtualModule('main.js');
    expect(notifier.events).toStrictEqual([
        makeEvent(EventType.EXECUTION, env.vmURL`dependency.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`importer.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`main.js`),
    ]);

    for (let i = 0; i < 2; ++i) {
        notifier.clear();
        virtualModules.add('dependency.js', nextDependencySource());
        await env.reloadVirtualModules(['dependency.js']);
        expect(notifier.events).toStrictEqual([
            makeEvent(EventType.DISPOSE, env.vmURL`dependency.js`),
            makeEvent(EventType.DISPOSE, env.vmURL`importer.js`),
            makeEvent(EventType.EXECUTION, env.vmURL`dependency.js`),
            makeEvent(EventType.EXECUTION, env.vmURL`importer.js`),
        ]);
    }
});

test('Self accept error', async () => {
    const env = new Env();
    const { virtualModules } = env;
    const notifier = new Notifier(env);

    virtualModules.add('main.js', dedent`
    import './importer.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    `);

    virtualModules.add('importer.js', dedent`
    import './dependency.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    ${sourceOfReportSelfAcceptError}
    `);

    const ERROR_TIMES = 1;

    const nextDependencySource = (() => {
        let runIndex = 0;
        return () => {
            const source = dedent`
                ${sourceOfNotifyExecution}
                ${sourceOfInvokeDispose}
                ${runIndex > 0 && runIndex <= ERROR_TIMES ? `throw new Error('On purpose');` : ''}
                `;
            ++runIndex;
            return source;
        };
    })();

    virtualModules.add('dependency.js', nextDependencySource());

    await env.importVirtualModule('main.js');
    expect(notifier.events).toStrictEqual([
        makeEvent(EventType.EXECUTION, env.vmURL`dependency.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`importer.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`main.js`),
    ]);

    for (let i = 0; i < ERROR_TIMES; ++i) {
        notifier.clear();
        virtualModules.add('dependency.js', nextDependencySource());
        await env.reloadVirtualModules(['dependency.js']);
        expect(notifier.events).toStrictEqual([
            makeEvent(EventType.DISPOSE, env.vmURL`dependency.js`),
            makeEvent(EventType.DISPOSE, env.vmURL`importer.js`),
            makeEvent(EventType.EXECUTION, env.vmURL`dependency.js`),
            makeEvent(EventType.SELF_ACCEPT_ERROR, env.vmURL`importer.js`),
        ]);
    }
});

test('Dependency accept', async () => {
    const env = new Env();
    const { virtualModules } = env;
    const notifier = new Notifier(env);

    virtualModules.add('main.js', dedent`
    import './importer.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    `);

    virtualModules.add('importer.js', dedent`
    import './dependency.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    ${sourceOfReportDependencyAccept('./dependency.js')}
    `);

    const GOOD_TIMES = 0;
    const ERROR_TIMES = 2;

    // Good for GOOD_TIMES, then bad for ERROR_TIMES, then good
    const nextDependencySource = (() => {
        let runIndex = 0;
        return () => {
            const code = dedent`
                ${sourceOfNotifyExecution}
                ${sourceOfInvokeDispose}
                ${runIndex > GOOD_TIMES && runIndex <= GOOD_TIMES + ERROR_TIMES ? `throw new Error('On purpose');` : ''}
            `;
            ++runIndex;
            return code;
        };
    })();

    virtualModules.add('dependency.js', nextDependencySource());

    await env.importVirtualModule('main.js');
    expect(notifier.events).toStrictEqual([
        makeEvent(EventType.EXECUTION, env.vmURL`dependency.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`importer.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`main.js`),
    ]);

    for (let i = 0; i < GOOD_TIMES; ++i) {
        notifier.clear();
        virtualModules.add('dependency.js', nextDependencySource());
        await env.reloadVirtualModules(['dependency.js']);
        expect(notifier.events).toStrictEqual([
            makeEvent(EventType.DISPOSE, env.vmURL`dependency.js`),
            makeEvent(EventType.EXECUTION, env.vmURL`dependency.js`),
            makeEvent(EventType.DEPENDENCY_ACCEPT, env.vmURL`importer.js`),
        ]);
    }

    for (let i = 0; i < ERROR_TIMES; ++i) {
        notifier.clear();
        virtualModules.add('dependency.js', nextDependencySource());
        await env.reloadVirtualModules(['dependency.js']);
        expect(notifier.events).toStrictEqual([
            makeEvent(EventType.DISPOSE, env.vmURL`dependency.js`),
            makeEvent(EventType.EXECUTION, env.vmURL`dependency.js`),
            makeEvent(EventType.DEPENDENCY_ACCEPT_ERROR, env.vmURL`importer.js`),
        ]);
    }

    notifier.clear();
    virtualModules.add('dependency.js', nextDependencySource());
    await env.reloadVirtualModules(['dependency.js']);
    expect(notifier.events).toStrictEqual([
        makeEvent(EventType.DISPOSE, env.vmURL`dependency.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`dependency.js`),
        makeEvent(EventType.DEPENDENCY_ACCEPT, env.vmURL`importer.js`),
    ]);
});

test('One parent self accept and another dependency accept', async () => {
    const env = new Env();
    const { virtualModules } = env;
    const notifier = new Notifier(env);

    virtualModules.add('main.js', dedent`
    import './importer-accept-self.js';
    import './importer-accept-dependency.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    `);

    virtualModules.add('importer-accept-self.js', dedent`
    import './dependency.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    ${sourceOfSelfAccept}
    `);

    virtualModules.add('importer-accept-dependency.js', dedent`
    import './dependency.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    ${sourceOfReportDependencyAcceptUpdate('./dependency.js')}
    `);

    const nextDependencySource = () => dedent`
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    `;

    virtualModules.add('dependency.js', nextDependencySource());

    await env.importVirtualModule('main.js');
    expect(notifier.events).toStrictEqual([
        makeEvent(EventType.EXECUTION, env.vmURL`dependency.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`importer-accept-self.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`importer-accept-dependency.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`main.js`),
    ]);

    for (let i = 0; i < 2; ++i) {
        notifier.clear();
        virtualModules.add('dependency.js', nextDependencySource());
        await env.reloadVirtualModules(['dependency.js']);
        expect(notifier.events).toStrictEqual([
            makeEvent(EventType.DISPOSE, env.vmURL`dependency.js`),
            makeEvent(EventType.DISPOSE, env.vmURL`importer-accept-self.js`),
            makeEvent(EventType.EXECUTION, env.vmURL`dependency.js`),
            makeEvent(EventType.EXECUTION, env.vmURL`importer-accept-self.js`),
            makeEvent(EventType.DEPENDENCY_ACCEPT, env.vmURL`importer-accept-dependency.js`),
        ]);
    }
});

test('Module that doesn\'t accept, or does not use any hot API.', async () => {
    const env = new Env();
    const { virtualModules } = env;
    const notifier = new Notifier(env);

    virtualModules.add('main.js', dedent`
    import './importer-accept.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    `);

    virtualModules.add('importer-accept.js', dedent`
    import './importer-does-not-accept.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    ${sourceOfSelfAccept}
    `);

    virtualModules.add('importer-does-not-accept.js', dedent`
    import './importer-does-not-use-any-hot-api.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    `);

    virtualModules.add('importer-does-not-use-any-hot-api.js', dedent`
    import './dependency.js';
    ${sourceOfNotifyExecution}
    `);

    const nextDependencySource = () => dedent`
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    `;

    virtualModules.add('dependency.js', nextDependencySource());

    await env.importVirtualModule('main.js');
    expect(notifier.events).toStrictEqual([
        makeEvent(EventType.EXECUTION, env.vmURL`dependency.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`importer-does-not-use-any-hot-api.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`importer-does-not-accept.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`importer-accept.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`main.js`),
    ]);

    for (let i = 0; i < 2; ++i) {
        notifier.clear();
        virtualModules.add('dependency.js', nextDependencySource());
        await env.reloadVirtualModules(['dependency.js']);
        expect(notifier.events).toStrictEqual([
            makeEvent(EventType.DISPOSE, env.vmURL`dependency.js`),
            makeEvent(EventType.DISPOSE, env.vmURL`importer-does-not-accept.js`),
            makeEvent(EventType.DISPOSE, env.vmURL`importer-accept.js`),
            makeEvent(EventType.EXECUTION, env.vmURL`dependency.js`),
            makeEvent(EventType.EXECUTION, env.vmURL`importer-does-not-use-any-hot-api.js`),
            makeEvent(EventType.EXECUTION, env.vmURL`importer-does-not-accept.js`),
            makeEvent(EventType.EXECUTION, env.vmURL`importer-accept.js`),
        ]);
    }
});

test('Circular dependence', async () => {
    const env = new Env();
    const { virtualModules } = env;
    const notifier = new Notifier(env);

    virtualModules.add('main.js', dedent`
    import './a.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    import.meta.ccHot.accept();
    `);

    virtualModules.add('a.js', dedent`
    import './b.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    `);

    virtualModules.add('b.js', dedent`
    import './c.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    `);

    virtualModules.add('c.js', dedent`
    import './a.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    `);

    await env.importVirtualModule('main.js');
    expect(notifier.events).toStrictEqual([
        makeEvent(EventType.EXECUTION, env.vmURL`c.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`b.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`a.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`main.js`),
    ]);

    notifier.clear();
    await env.reloadVirtualModules(['b.js']);
    expect(notifier.events).toStrictEqual([
        makeEvent(EventType.DISPOSE, env.vmURL`b.js`),
        makeEvent(EventType.DISPOSE, env.vmURL`a.js`),
        makeEvent(EventType.DISPOSE, env.vmURL`c.js`),
        makeEvent(EventType.DISPOSE, env.vmURL`main.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`a.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`c.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`b.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`main.js`),
    ]);
});

test('Delete dependency', async () => {
    const env = new Env();
    const { virtualModules } = env;
    const notifier = new Notifier(env);

    virtualModules.add('main.js', dedent`
    import './importer.js';
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    `);

    const sourceOfImporter = (hasDependency: boolean) => dedent`
        ${hasDependency ? `import './dependency.js';` : ''}
        ${sourceOfNotifyExecution}
        ${sourceOfInvokeDispose}
        ${sourceOfSelfAccept}
    `;

    const sourceOfDependency = () => dedent`
        ${sourceOfNotifyExecution}
        ${sourceOfInvokeDispose}
    `;

    virtualModules.add('importer.js', sourceOfImporter(true));
    virtualModules.add('dependency.js', sourceOfDependency());

    await env.importVirtualModule('main.js');
    expect(notifier.events).toStrictEqual([
        makeEvent(EventType.EXECUTION, env.vmURL`dependency.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`importer.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`main.js`),
    ]);

    notifier.clear();
    virtualModules.add('importer.js', sourceOfImporter(false));
    virtualModules.add('dependency.js', '');
    await env.reloadVirtualModules(['dependency.js', 'importer.js']);
    expect(notifier.events).toStrictEqual([
        makeEvent(EventType.DISPOSE, env.vmURL`dependency.js`),
        makeEvent(EventType.DISPOSE, env.vmURL`importer.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`importer.js`),
    ]);
});

test('Update is propagated to the main, which has no any hot config', async () => {
    const env = new Env();
    const { virtualModules } = env;

    virtualModules.add('main.js', dedent`
    import './importer.js';
    `);

    virtualModules.add('importer.js', dedent`
    export {};
    `);

    await env.importVirtualModule('main.js');

    expect(await env.reloadVirtualModules(['importer.js'])).toBe(false);
});

test('Update is propagated to the main, which self accept', async () => {
    const env = new Env();
    const { virtualModules } = env;
    const notifier = new Notifier(env);

    virtualModules.add('main.js', dedent`
    import './dependency.js';
    import.meta.ccHot.accept();
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    `);

    virtualModules.add('dependency.js', dedent`
    ${sourceOfNotifyExecution}
    ${sourceOfInvokeDispose}
    export {};
    `);

    await env.importVirtualModule('main.js');

    notifier.clear();
    expect(await env.reloadVirtualModules(['dependency.js'])).toBe(true);
    expect(notifier.events).toStrictEqual([
        makeEvent(EventType.DISPOSE, env.vmURL`dependency.js`),
        makeEvent(EventType.DISPOSE, env.vmURL`main.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`dependency.js`),
        makeEvent(EventType.EXECUTION, env.vmURL`main.js`),
    ]);
});

class VolatileBindingModule {
    public next() {
        ++this._expectedValue;
        return dedent`
        export const v = ${this._expectedValue};
        `;
    }

    public bindingNames() {
        return ['v'];
    }

    public bindingNamesAsImportClause() {
        return this.bindingNames().map((bindingName) => `${bindingName}`).join(', ');
    }

    public expected() {
        return [this._expectedValue];
    }

    private _expectedValue = 0;
}
