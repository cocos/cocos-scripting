type I18N = {
    t(textName: string, params?: unknown): string;
    register(lang: 'zh' | 'en', key: string, map: any): void;
};

declare namespace Editor {
    const I18n: I18N;
}
