import type * as estree from 'estree';
import MagicString from 'magic-string';
import type { ProgramNode } from 'rollup';
import type { Plugin } from 'vite';
import { parseAstAsync } from 'vite';

type NodeWithRange = estree.Node & { start: number; end: number };
type ExpressionWithRange = estree.Expression & { start: number; end: number };

const isNodeWithRange = (value: unknown): value is NodeWithRange =>
  typeof (value as { type?: unknown })?.type === 'string' &&
  typeof (value as { start?: unknown })?.start === 'number' &&
  typeof (value as { end?: unknown })?.end === 'number';

const isIdentifierWithRange = (
  node: estree.Node | null | undefined,
): node is estree.Identifier & { start: number; end: number } =>
  node?.type === 'Identifier' &&
  typeof (node as { start?: unknown }).start === 'number' &&
  typeof (node as { end?: unknown }).end === 'number';

const isExpressionWithRange = (
  node: estree.Node | null | undefined,
): node is ExpressionWithRange =>
  !!node &&
  typeof (node as { start?: unknown }).start === 'number' &&
  typeof (node as { end?: unknown }).end === 'number' &&
  'type' in node &&
  typeof (node as { type: unknown }).type === 'string';

const getImportedName = (specifier: estree.ImportSpecifier): string =>
  specifier.imported.type === 'Identifier'
    ? specifier.imported.name
    : String(specifier.imported.value);

const getExportedName = (specifier: estree.ExportSpecifier): string =>
  specifier.exported.type === 'Identifier'
    ? specifier.exported.name
    : String(specifier.exported.value);

const getLocalExportName = (
  specifier: estree.ExportSpecifier,
): string | null =>
  specifier.local.type === 'Identifier'
    ? specifier.local.name
    : typeof specifier.local.value === 'string'
      ? specifier.local.value
      : null;

const getExpressionFromArgument = (
  arg: estree.Expression | estree.SpreadElement,
): ExpressionWithRange | null => {
  if (arg.type === 'SpreadElement') {
    return isExpressionWithRange(arg.argument) ? arg.argument : null;
  }
  return isExpressionWithRange(arg) ? arg : null;
};

const isUseDirective = (stmt: estree.Node, directive: string): boolean =>
  stmt.type === 'ExpressionStatement' &&
  stmt.expression.type === 'Literal' &&
  stmt.expression.value === directive;

const getDeclarationId = (
  item: estree.Node,
): (estree.Identifier & { start: number; end: number }) | undefined => {
  if (item.type === 'FunctionDeclaration' || item.type === 'ClassDeclaration') {
    return item.id && isIdentifierWithRange(item.id) ? item.id : undefined;
  }
  return undefined;
};

const transformExportedClientThings = (
  mod: ProgramNode,
): {
  allowServerDependencies: Set<string>;
  allowServerItems: Map<string, ExpressionWithRange>;
  exportNames: Set<string>;
} => {
  const exportNames = new Set<string>();
  // HACK this doesn't cover all cases
  const allowServerItems = new Map<string, ExpressionWithRange>();
  const allowServerDependencies = new Set<string>();
  const visited = new WeakSet<NodeWithRange>();
  const findDependencies = (node: estree.Node) => {
    if (!isNodeWithRange(node)) {
      throw new Error('Expected NodeWithRange');
    }
    if (visited.has(node)) {
      return;
    }
    visited.add(node);
    if (node.type === 'Identifier') {
      if (!allowServerItems.has(node.name) && !exportNames.has(node.name)) {
        allowServerDependencies.add(node.name);
      }
    }
    for (const value of Object.values(node) as unknown[]) {
      const values: unknown[] = Array.isArray(value) ? value : [value];
      for (const v of values) {
        if (isNodeWithRange(v)) {
          findDependencies(v);
        } else if (v) {
          const { expression } = v as { expression?: unknown };
          if (isNodeWithRange(expression)) {
            findDependencies(expression);
          }
        }
      }
    }
  };
  // Pass 1: find allowServer identifier
  let allowServer = 'unstable_allowServer';
  for (const item of mod.body) {
    if (
      item.type === 'ImportDeclaration' &&
      item.source.type === 'Literal' &&
      item.source.value === 'waku/client'
    ) {
      for (const specifier of item.specifiers) {
        if (
          specifier.type === 'ImportSpecifier' &&
          specifier.imported.type === 'Identifier' &&
          specifier.imported.name === allowServer
        ) {
          allowServer = specifier.local.name;
          break;
        }
      }
      break;
    }
  }
  // Pass 2: collect export names and allowServer names
  for (const item of mod.body) {
    if (item.type === 'ExportNamedDeclaration') {
      if (
        item.declaration?.type === 'FunctionDeclaration' &&
        item.declaration.id
      ) {
        exportNames.add(item.declaration.id.name);
      } else if (
        item.declaration?.type === 'ClassDeclaration' &&
        item.declaration.id
      ) {
        exportNames.add(item.declaration.id.name);
      } else if (item.declaration?.type === 'VariableDeclaration') {
        for (const d of item.declaration.declarations) {
          if (isIdentifierWithRange(d.id)) {
            if (
              d.init?.type === 'CallExpression' &&
              d.init.callee.type === 'Identifier' &&
              d.init.callee.name === allowServer
            ) {
              if (d.init.arguments.length !== 1) {
                throw new Error('allowServer should have exactly one argument');
              }
              const arg = getExpressionFromArgument(d.init.arguments[0]!);
              if (!arg) {
                throw new Error('allowServer should have exactly one argument');
              }
              allowServerItems.set(d.id.name, arg);
              findDependencies(d.init);
            } else {
              exportNames.add(d.id.name);
            }
          }
        }
      }
      for (const s of item.specifiers) {
        if (s.type === 'ExportSpecifier') {
          const localName = getLocalExportName(s);
          if (localName && allowServerItems.has(localName)) {
            continue;
          }
          exportNames.add(getExportedName(s));
        }
      }
    } else if (item.type === 'ExportDefaultDeclaration') {
      exportNames.add('default');
    } else if (item.type === 'ExportAllDeclaration') {
      if (item.exported?.type === 'Identifier') {
        exportNames.add(item.exported.name);
      }
    } else if (item.type === 'VariableDeclaration') {
      for (const d of item.declarations) {
        if (
          isIdentifierWithRange(d.id) &&
          d.init?.type === 'CallExpression' &&
          d.init.callee.type === 'Identifier' &&
          d.init.callee.name === allowServer
        ) {
          if (d.init.arguments.length !== 1) {
            throw new Error('allowServer should have exactly one argument');
          }
          const arg = getExpressionFromArgument(d.init.arguments[0]!);
          if (!arg) {
            throw new Error('allowServer should have exactly one argument');
          }
          allowServerItems.set(d.id.name, arg);
          findDependencies(d.init);
        }
      }
    }
  }
  // Pass 3: collect dependencies
  let dependenciesSize: number;
  do {
    dependenciesSize = allowServerDependencies.size;
    for (const item of mod.body) {
      if (item.type === 'VariableDeclaration') {
        for (const d of item.declarations) {
          if (
            isIdentifierWithRange(d.id) &&
            allowServerDependencies.has(d.id.name)
          ) {
            findDependencies(d);
          }
        }
      } else {
        const declId = getDeclarationId(item);
        if (declId && allowServerDependencies.has(declId.name)) {
          findDependencies(item);
        }
      }
    }
  } while (dependenciesSize < allowServerDependencies.size);
  allowServerDependencies.delete(allowServer);
  return { allowServerDependencies, allowServerItems, exportNames };
};

function shouldKeepStatement(
  stmt: estree.Node,
  dependencies: Set<string>,
): boolean {
  if (stmt.type === 'ImportDeclaration') {
    return stmt.specifiers.some(
      (s) =>
        s.type === 'ImportSpecifier' &&
        (dependencies.has(getImportedName(s)) ||
          dependencies.has(s.local.name)),
    );
  }
  if (stmt.type === 'VariableDeclaration') {
    return stmt.declarations.some(
      (d) => isIdentifierWithRange(d.id) && dependencies.has(d.id.name),
    );
  }
  const declId = getDeclarationId(stmt);
  if (declId) {
    return dependencies.has(declId.name);
  }
  return false;
}

function hasDirective(mod: ProgramNode, directive: string): boolean {
  for (const item of mod.body) {
    if (
      item.type === 'ExpressionStatement' &&
      item.expression.type === 'Literal' &&
      item.expression.value === directive
    ) {
      return true;
    }
  }
  return false;
}

export function allowServerPlugin(): Plugin {
  return {
    name: 'waku:vite-plugins:allow-server',
    async transform(code) {
      if (this.environment.name !== 'rsc') {
        return;
      }
      if (!code.includes('use client')) {
        return;
      }

      const mod = await parseAstAsync(code, { jsx: true });
      if (!hasDirective(mod, 'use client')) {
        return;
      }

      const { allowServerDependencies, allowServerItems, exportNames } =
        transformExportedClientThings(mod);

      const s = new MagicString(code);
      for (const item of mod.body) {
        if (!isNodeWithRange(item)) {
          throw new Error('Expected NodeWithRange');
        }
        if (isUseDirective(item, 'use client')) {
          s.remove(item.start, item.end);
          continue;
        }
        if (shouldKeepStatement(item, allowServerDependencies)) {
          continue;
        }
        s.remove(item.start, item.end);
      }

      for (const [allowServerName, callExp] of allowServerItems) {
        const expressionSource = code.slice(callExp.start, callExp.end);
        s.append(`export const ${allowServerName} = ${expressionSource};\n`);
      }
      let newCode = s.toString().trim().replace(/\n+/g, '\n') + '\n';
      for (const name of exportNames) {
        const value = `() => { throw new Error('It is not possible to invoke a client function from the server: ${JSON.stringify(name)}') }`;
        newCode += `export ${name === 'default' ? name : `const ${name} =`} ${value};\n`;
      }
      return `"use client";` + newCode.trimStart();
    },
  };
}
