# @cocos/babel-plugin-dynamic-import-vars

Inspired from [@rollup/plugin-dynamic-import-vars](https://github.com/rollup/plugins/tree/master/packages/dynamic-import-vars).

This plugin transforms for example:

```js
import(`./${lang}.js`)
```

into

```js
((specifier) => {
    switch (specifier) {
        case './zh-cn.js': return import('./zh-cn.js');
        case './en-us.js': return import('./en-us.js');
        default: return import(specifier);
    }
})(`./${lang}.js`)
```

given `'./${lang}.js'` can be statically resolved as `'./zh-cn.js'`, `'./en-us.js'` etc.

# Rules

Similar with `@rollup/plugin-dynamic-import-vars` except that:

- If none of the preset specifiers matches, the code won't throw but still fallback to run.

- Supplied an options to resolve `.js` to others for example `.ts`.