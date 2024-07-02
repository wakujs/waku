import type { Plugin } from 'vite';
import * as swc from '@swc/core';

import { EXTENSIONS } from '../config.js';
import { extname } from '../utils/path.js';
import { parseOpts } from '../utils/swc.js';

const collectExportNames = (mod: swc.Module) => {
  const exportNames = new Set<string>();
  for (const item of mod.body) {
    if (item.type === 'ExportDeclaration') {
      if (item.declaration.type === 'FunctionDeclaration') {
        exportNames.add(item.declaration.identifier.value);
      } else if (item.declaration.type === 'VariableDeclaration') {
        for (const d of item.declaration.declarations) {
          if (d.id.type === 'Identifier') {
            exportNames.add(d.id.value);
          }
        }
      }
    } else if (item.type === 'ExportNamedDeclaration') {
      for (const s of item.specifiers) {
        if (s.type === 'ExportSpecifier') {
          exportNames.add(s.exported ? s.exported.value : s.orig.value);
        }
      }
    } else if (item.type === 'ExportDefaultExpression') {
      exportNames.add('default');
    } else if (item.type === 'ExportDefaultDeclaration') {
      exportNames.add('default');
    }
  }
  return exportNames;
};

const transformClient = (
  code: string,
  id: string,
  getServerId: (id: string) => string,
) => {
  const ext = extname(id);
  const mod = swc.parseSync(code, parseOpts(ext));
  let hasUseServer = false;
  for (const item of mod.body) {
    if (item.type === 'ExpressionStatement') {
      if (
        item.expression.type === 'StringLiteral' &&
        item.expression.value === 'use server'
      ) {
        hasUseServer = true;
      }
    } else {
      break;
    }
  }
  if (hasUseServer) {
    const exportNames = collectExportNames(mod);
    let newCode = `
import { createServerReference } from 'react-server-dom-webpack/client';
import { callServerRSC } from 'waku/client';
`;
    for (const name of exportNames) {
      newCode += `
export ${name === 'default' ? name : `const ${name} =`} createServerReference('${getServerId(id)}#${name}', callServerRSC);
`;
    }
    return newCode;
  }
};

const createIdentifier = (value: string): swc.Identifier => ({
  type: 'Identifier',
  value,
  optional: false,
  span: { start: 0, end: 0, ctxt: 0 },
});

const createStringLiteral = (value: string): swc.StringLiteral => ({
  type: 'StringLiteral',
  value,
  span: { start: 0, end: 0, ctxt: 0 },
});

const createCallExpression = (
  callee: swc.Expression,
  args: swc.Expression[],
): swc.CallExpression => ({
  type: 'CallExpression',
  callee,
  arguments: args.map((expression) => ({ expression })),
  span: { start: 0, end: 0, ctxt: 0 },
});

const serverActionsInitCode = swc.parseSync(`
import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
`).body;

type FunctionWithBlockBody = (
  | swc.FunctionDeclaration
  | swc.FunctionExpression
  | swc.ArrowFunctionExpression
) & { body: swc.BlockStatement };

const isUseServerDirective = (node: swc.Node) =>
  node.type === 'ExpressionStatement' &&
  (node as swc.ExpressionStatement).expression.type === 'StringLiteral' &&
  ((node as swc.ExpressionStatement).expression as swc.StringLiteral).value ===
    'use server';

const isServerAction = (node: swc.Node): node is FunctionWithBlockBody =>
  (node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression') &&
  (node as { body?: { type: string } }).body?.type === 'BlockStatement' &&
  (node as FunctionWithBlockBody).body.stmts.some(isUseServerDirective);

const prependArgsToFn = <Fn extends FunctionWithBlockBody>(
  fn: Fn,
  args: string[],
): Fn => {
  if (fn.type === 'ArrowFunctionExpression') {
    return {
      ...fn,
      params: [...args.map(createIdentifier), ...fn.params],
      body: {
        type: 'BlockStatement',
        stmts: fn.body.stmts.filter((stmt) => !isUseServerDirective(stmt)),
        span: { start: 0, end: 0, ctxt: 0 },
      },
    };
  }
  return {
    ...fn,
    params: [
      ...args.map((arg) => ({
        type: 'Parameter',
        pat: createIdentifier(arg),
        span: { start: 0, end: 0, ctxt: 0 },
      })),
      ...fn.params,
    ],
    body: {
      type: 'BlockStatement',
      stmts: fn.body.stmts.filter((stmt) => !isUseServerDirective(stmt)),
      span: { start: 0, end: 0, ctxt: 0 },
    },
  };
};

// HACK this doesn't work for 100% of cases
const collectIndentifiers = (node: swc.Node, ids: Set<string>) => {
  if (node.type === 'Identifier') {
    ids.add((node as swc.Identifier).value);
  } else if (node.type === 'MemberExpression') {
    collectIndentifiers((node as swc.MemberExpression).object, ids);
  } else if (node.type === 'KeyValuePatternProperty') {
    collectIndentifiers((node as swc.KeyValuePatternProperty).key, ids);
  } else if (node.type === 'AssignmentPatternProperty') {
    collectIndentifiers((node as swc.AssignmentPatternProperty).key, ids);
  } else {
    Object.values(node).forEach((value) => {
      if (Array.isArray(value)) {
        value.forEach((v) => collectIndentifiers(v, ids));
      } else if (typeof value === 'object' && value !== null) {
        collectIndentifiers(value, ids);
      }
    });
  }
};

// HACK this doesn't work for 100% of cases
const collectLocalNames = (
  fn: swc.Fn | swc.ArrowFunctionExpression,
  ids: Set<string>,
) => {
  fn.params.forEach((param) => {
    collectIndentifiers(param, ids);
  });
  let stmts: swc.Statement[];
  if (!fn.body) {
    stmts = [];
  } else if (fn.body?.type === 'BlockStatement') {
    stmts = fn.body.stmts;
  } else {
    // body is Expression
    stmts = [
      {
        type: 'ReturnStatement',
        argument: fn.body,
        span: { start: 0, end: 0, ctxt: 0 },
      },
    ];
  }
  for (const stmt of stmts) {
    if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations) {
        collectIndentifiers(decl.id, ids);
      }
    }
  }
};

const collectClosureVars = (
  parentFn: swc.Fn | swc.ArrowFunctionExpression | undefined,
  fn: FunctionWithBlockBody,
): string[] => {
  const parentFnVarNames = new Set<string>();
  if (parentFn) {
    collectLocalNames(parentFn, parentFnVarNames);
  }
  const fnVarNames = new Set<string>();
  collectIndentifiers(fn, fnVarNames);
  const varNames = Array.from(parentFnVarNames).filter((n) =>
    fnVarNames.has(n),
  );
  return varNames;
};

const transformServerActions = (
  mod: swc.Module,
  getActionId: () => string,
): swc.Module | void => {
  let serverActionIndex = 0;
  const serverActions = new Map<
    number,
    readonly [FunctionWithBlockBody, string[]]
  >();
  const registerServerAction = (
    parentFn: swc.Fn | swc.ArrowFunctionExpression | undefined,
    fn: FunctionWithBlockBody,
  ): swc.CallExpression => {
    const closureVars = collectClosureVars(parentFn, fn);
    serverActions.set(++serverActionIndex, [fn, closureVars]);
    const name = '__waku_action' + serverActionIndex;
    if (fn.type === 'FunctionDeclaration') {
      fn.identifier = createIdentifier(name);
    }
    return createCallExpression(
      {
        type: 'MemberExpression',
        object: createIdentifier(name),
        property: createIdentifier('bind'),
        span: { start: 0, end: 0, ctxt: 0 },
      },
      [
        createIdentifier('null'),
        ...closureVars.map((v) => createIdentifier(v)),
      ],
    );
  };
  const handleDeclaration = (
    parentFn: swc.Fn | swc.ArrowFunctionExpression | undefined,
    decl: swc.Declaration,
  ) => {
    if (isServerAction(decl)) {
      const callExp = registerServerAction(parentFn, Object.assign({}, decl));
      const newDecl: swc.VariableDeclaration = {
        type: 'VariableDeclaration',
        kind: 'const',
        declare: false,
        declarations: [
          {
            type: 'VariableDeclarator',
            id: createIdentifier(decl.identifier.value),
            init: callExp,
            definite: false,
            span: { start: 0, end: 0, ctxt: 0 },
          },
        ],
        span: { start: 0, end: 0, ctxt: 0 },
      };
      Object.keys(decl).forEach((key) => {
        delete decl[key as keyof typeof decl];
      });
      Object.assign(decl, newDecl);
    }
  };
  const handleExpression = (
    parentFn: swc.Fn | swc.ArrowFunctionExpression | undefined,
    exp: swc.Expression,
  ) => {
    if (isServerAction(exp)) {
      const callExp = registerServerAction(parentFn, Object.assign({}, exp));
      Object.keys(exp).forEach((key) => {
        delete exp[key as keyof typeof exp];
      });
      Object.assign(exp, callExp);
    }
  };
  const walk = (
    parentFn: swc.Fn | swc.ArrowFunctionExpression | undefined,
    node: swc.Node,
  ) => {
    // FIXME do we need to walk the entire tree? feels inefficient
    Object.values(node).forEach((value) => {
      const fn =
        node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression'
          ? (node as swc.Fn | swc.ArrowFunctionExpression)
          : parentFn;
      (Array.isArray(value) ? value : [value]).forEach((v) => {
        if (typeof v?.type === 'string') {
          walk(fn, v);
        } else if (typeof v?.expression?.type === 'string') {
          walk(fn, v.expression);
        }
      });
    });
    if (node.type === 'FunctionDeclaration') {
      handleDeclaration(parentFn, node as swc.FunctionDeclaration);
    } else if (
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    ) {
      handleExpression(
        parentFn,
        node as swc.FunctionExpression | swc.ArrowFunctionExpression,
      );
    }
  };
  walk(undefined, mod);
  if (!serverActionIndex) {
    return;
  }
  const lastImportIndex = mod.body.findIndex(
    (node) =>
      node.type !== 'ExpressionStatement' && node.type !== 'ImportDeclaration',
  );
  mod.body.splice(lastImportIndex, 0, ...serverActionsInitCode);
  for (const [actionIndex, [actionFn, closureVars]] of serverActions) {
    if (actionFn.type === 'FunctionDeclaration') {
      const stmt1: swc.ExportDeclaration = {
        type: 'ExportDeclaration',
        declaration: prependArgsToFn(actionFn, closureVars),
        span: { start: 0, end: 0, ctxt: 0 },
      };
      const stmt2: swc.ExpressionStatement = {
        type: 'ExpressionStatement',
        expression: createCallExpression(
          createIdentifier('__waku_registerServerReference'),
          [
            createIdentifier(actionFn.identifier.value),
            createStringLiteral(getActionId()),
            createStringLiteral('__waku_action' + actionIndex),
          ],
        ),
        span: { start: 0, end: 0, ctxt: 0 },
      };
      mod.body.push(stmt1, stmt2);
    } else {
      const stmt: swc.ExportDeclaration = {
        type: 'ExportDeclaration',
        declaration: {
          type: 'VariableDeclaration',
          kind: 'const',
          declare: false,
          declarations: [
            {
              type: 'VariableDeclarator',
              id: createIdentifier('__waku_action' + actionIndex),
              init: createCallExpression(
                createIdentifier('__waku_registerServerReference'),
                [
                  prependArgsToFn(actionFn, closureVars),
                  createStringLiteral(getActionId()),
                  createStringLiteral('__waku_action' + actionIndex),
                ],
              ),
              definite: false,
              span: { start: 0, end: 0, ctxt: 0 },
            },
          ],
          span: { start: 0, end: 0, ctxt: 0 },
        },
        span: { start: 0, end: 0, ctxt: 0 },
      };
      mod.body.push(stmt);
    }
  }
  return mod;
};

const transformServer = (
  code: string,
  id: string,
  getClientId: (id: string) => string,
  getServerId: (id: string) => string,
) => {
  const ext = extname(id);
  const mod = swc.parseSync(code, parseOpts(ext));
  let hasUseClient = false;
  let hasUseServer: swc.ExpressionStatement | undefined;
  for (const item of mod.body) {
    if (item.type === 'ExpressionStatement') {
      if (item.expression.type === 'StringLiteral') {
        if (item.expression.value === 'use client') {
          hasUseClient = true;
        } else if (item.expression.value === 'use server') {
          hasUseServer = item;
        }
      }
    } else {
      // HACK we can't stop the loop here, because vite may put some import statements before the directives
      // break;
    }
  }
  if (hasUseClient) {
    const exportNames = collectExportNames(mod);
    let newCode = `
import { registerClientReference } from 'react-server-dom-webpack/server.edge';
`;
    for (const name of exportNames) {
      newCode += `
export ${name === 'default' ? name : `const ${name} =`} registerClientReference(() => { throw new Error('It is not possible to invoke a client function from the server: ${getClientId(id)}#${name}'); }, '${getClientId(id)}', '${name}');
`;
    }
    return newCode;
  } else if (hasUseServer) {
    const useServerPosStart = hasUseServer.span.start - mod.span.start;
    const useServerPosEnd = hasUseServer.span.end - mod.span.start;
    const lastImportIndex = mod.body.findIndex(
      (node) =>
        node.type !== 'ExpressionStatement' &&
        node.type !== 'ImportDeclaration',
    );
    let lastImportPos =
      lastImportIndex === -1 ? 0 : mod.body[lastImportIndex]!.span.end;
    if (lastImportIndex < useServerPosEnd) {
      lastImportPos = useServerPosEnd;
    }
    const exportNames = collectExportNames(mod);
    const newCode = [
      code.slice(0, useServerPosStart),
      code.slice(useServerPosEnd, lastImportPos),
      `
import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
`,
      code.slice(lastImportPos),
      ...[...exportNames].map(
        (name) => `
if (typeof ${name} === 'function') {
  __waku_registerServerReference(${name}, '${getServerId(id)}', '${name}');
}
`,
      ),
    ].join('');
    return newCode;
  }
  // transform server actions in server components
  const newMod =
    code.includes('use server') &&
    transformServerActions(mod, () => getServerId(id));
  if (newMod) {
    const newCode = swc.printSync(newMod).code;
    return newCode;
  }
};

export function rscTransformPlugin(
  opts:
    | {
        isClient: true;
        isBuild: false;
      }
    | {
        isClient: true;
        isBuild: true;
        serverEntryFiles: Record<string, string>;
      }
    | {
        isClient: false;
        isBuild: false;
      }
    | {
        isClient: false;
        isBuild: true;
        clientEntryFiles: Record<string, string>;
        serverEntryFiles: Record<string, string>;
      },
): Plugin {
  const getClientId = (id: string) => {
    if (opts.isClient || !opts.isBuild) {
      throw new Error('not buiding for server');
    }
    for (const [k, v] of Object.entries(opts.clientEntryFiles)) {
      if (v === id) {
        return `@id/${k}.js`;
      }
    }
    throw new Error('client id not found: ' + id);
  };
  const getServerId = (id: string) => {
    if (!opts.isBuild) {
      throw new Error('not buiding');
    }
    for (const [k, v] of Object.entries(opts.serverEntryFiles)) {
      if (v === id) {
        return `@id/${k}.js`;
      }
    }
    throw new Error('server id not found: ' + id);
  };
  return {
    name: 'rsc-transform-plugin',
    async transform(code, id, options) {
      if (!opts.isBuild) {
        // id can contain query string with vite deps optimization
        id = id.split('?')[0] as string;
      }
      if (!EXTENSIONS.includes(extname(id))) {
        return;
      }
      if (opts.isClient) {
        if (options?.ssr) {
          return;
        }
        return transformClient(
          code,
          id,
          opts.isBuild ? getServerId : (id) => id,
        );
      }
      // isClient === false
      if (!options?.ssr) {
        return;
      }
      return transformServer(
        code,
        id,
        opts.isBuild ? getClientId : (id) => id,
        opts.isBuild ? getServerId : (id) => id,
      );
    },
  };
}
