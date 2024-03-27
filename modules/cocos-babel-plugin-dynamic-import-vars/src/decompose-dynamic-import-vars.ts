
import type * as babel from '@babel/core';

/**
 * Parts of a specifier. `null` implies a non-string-literal part.
 * The `string`s and `null`s are interleaved.
 */
export type SpecifierParts = Array<string | null>;

export default function decomposeDynamicImportVars(node: babel.types.Node): SpecifierParts {
    const rawParts = decomposeExpression(node);
    const prettyParts = [];
    for (let iRaw = 0; iRaw < rawParts.length;) {
        const unit = rawParts[iRaw];
        let prettyUnit;
        if (unit === null) {
            prettyUnit = null;
            for (; iRaw < rawParts.length && rawParts[iRaw] === null; ++iRaw) {
                // Nop
            }
        } else {
            prettyUnit = '';
            for (; iRaw < rawParts.length && (typeof rawParts[iRaw] === 'string'); ++iRaw) {
                prettyUnit += rawParts[iRaw];
            }
        }
        prettyParts.push(prettyUnit);
    }
    return prettyParts;
}

function decomposeExpression(node: babel.types.Node): SpecifierParts {
    switch (node.type) {
        case 'StringLiteral': return decomposeStringLiteral(node);
        case 'TemplateLiteral': return decomposeTemplateLiteral(node);
        case 'BinaryExpression': return decomposeBinaryExpression(node);
    }
    return [null];
}

function decomposeStringLiteral(node: babel.types.StringLiteral): SpecifierParts {
    return [node.value];
}

function decomposeTemplateLiteral(node: babel.types.TemplateLiteral): SpecifierParts {
    const parts: SpecifierParts = [];
    for (let i = 0; i < node.quasis.length; ++i) {
        const quasi = node.quasis[i];
        const quasiValue = quasi.value.raw;
        if (quasiValue.length !== 0) {
            parts.push(quasiValue);
        }
        const expr = node.expressions[i];
        if (expr) {
            parts.push(...decomposeExpression(expr));
        }
    }
    return parts;
}

function decomposeBinaryExpression(node: babel.types.BinaryExpression) {
    if (node.operator !== '+') {
        return [null];
    }
    return [...decomposeExpression(node.left), ...decomposeExpression(node.right)];
}
