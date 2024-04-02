# @cocos/module-system

the module system used to drive the cocos engine and project scripts.

## Setup the Develepment environment



__we use node version 18.x__



install the dependency

```shell
npm install
```

fetch the source code of systemjs and compile the systemjs extras.
```shell
npm run init
```

## How to use @cocos/module-system

build module system
```js
const { build } = require('@cocos/module-system');
const { join } = require('path');

(async function () {
    await build({
        out: join(__dirname, './system.bundle.js'),
        sourceMap: false,
        minify: false,
        platform: 'windows'
    });
})();

```
