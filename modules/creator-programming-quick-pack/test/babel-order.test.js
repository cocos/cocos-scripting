const { URL } = require("url");
const { BabelTransformer } = require("../../creator-programming-mod-lo/lib/transformer/babel/babel-transformer");

const babelTransformer = new BabelTransformer({
    loose: false,
    useDefineForClassFields: true,
    allowDeclareFields: true,
});
(async () => {
    const mod = await babelTransformer.transformCommonJs(new URL('foo:/bar'), `
    module.exports = false;
    ok();
    `, undefined, false);

    console.log((await mod.systemjs()).source.code);
})();