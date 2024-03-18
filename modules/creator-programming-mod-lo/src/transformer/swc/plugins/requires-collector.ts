
import * as swc from '@swc/core';
import Visitor from '@swc/core/Visitor';

export class RequiresCollector extends Visitor {
    get requires() {
        return this._requires;
    }

    public visitCallExpression(callExpression: swc.CallExpression): swc.CallExpression {
        if (callExpression.callee.type === 'Identifier' &&
            callExpression.callee.value === 'require' &&
            callExpression.arguments.length === 1 &&
            callExpression.arguments[0].expression.type === 'StringLiteral'
        ) {
            this._requires.push(callExpression.arguments[0].expression.value);
        }
        return callExpression;
    }

    private _requires: string[] = [];
}
