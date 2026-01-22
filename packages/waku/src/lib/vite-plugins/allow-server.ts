import MagicString from 'magic-string';
import type { Plugin } from 'vite';
import { parseAstAsync } from 'vite';

type ProgramNode = Awaited<ReturnType<typeof parseAstAsync>>;
type BodyItem = ProgramNode['body'][number];
type VariableDeclaration = BodyItem & {
  type: 'VariableDeclaration';
};
type VariableDeclarator = VariableDeclaration['declarations'][number];
type ImportDeclaration = BodyItem & {
  type: 'ImportDeclaration';
};
type ImportSpecifier = ImportDeclaration['specifiers'][number] & {
  type: 'ImportSpecifier';
};
type ExportNamedDeclaration = BodyItem & {
  type: 'ExportNamedDeclaration';
};
type ExportSpecifier = ExportNamedDeclaration['specifiers'][number] & {
  type: 'ExportSpecifier';
};
type ExpressionStatement = BodyItem & {
  type: 'ExpressionStatement';
};
type Expression = ExpressionStatement['expression'];
type AstNode = BodyItem | Expression | VariableDeclarator;
type CallExpression = Expression & { type: 'CallExpression' };
type SpreadElement = CallExpression['arguments'][number] & {
  type: 'SpreadElement';
};

const isNode = (value: unknown): value is AstNode =>
  typeof (value as { type?: unknown })?.type === 'string'; // heuristic

const isNodeWithRange = (
  node: AstNode,
): node is AstNode & { start: number; end: number } =>
  typeof (node as { start?: unknown })?.start === 'number' &&
  typeof (node as { end?: unknown })?.end === 'number';

const getImportedName = (specifier: ImportSpecifier) =>
  specifier.imported.type === 'Identifier'
    ? specifier.imported.name
    : String(specifier.imported.value);

const getExportedName = (specifier: ExportSpecifier) =>
  specifier.exported.type === 'Identifier'
    ? specifier.exported.name
    : String(specifier.exported.value);

const getLocalExportName = (specifier: ExportSpecifier) =>
  specifier.local.type === 'Identifier'
    ? specifier.local.name
    : typeof specifier.local.value === 'string'
      ? specifier.local.value
      : null;

const getExpressionFromArguments = (args: (Expression | SpreadElement)[]) => {
  if (args.length !== 1) {
    throw new Error('allowServer should have exactly one argument');
  }
  const arg = args[0]!;
  const argument = arg.type === 'SpreadElement' ? arg.argument : arg;
  if (!isNodeWithRange(argument)) {
    throw new Error('Missing range');
  }
  return argument;
};

const isUseDirective = (stmt: BodyItem, directive: string) =>
  stmt.type === 'ExpressionStatement' &&
  stmt.expression.type === 'Literal' &&
  stmt.expression.value === directive;

const getDeclarationId = (item: BodyItem) =>
  (item.type === 'FunctionDeclaration' || item.type === 'ClassDeclaration') &&
  item.id.type === 'Identifier' &&
  item.id;

const transformExportedClientThings = (mod: ProgramNode) => {
  const exportNames = new Set<string>();
  // HACK this doesn't cover all cases
  const allowServerItems = new Map<
    string,
    Expression & { start: number; end: number }
  >();
  const allowServerDependencies = new Set<string>();
  const visited = new WeakSet<AstNode>();
  const findDependencies = (node: AstNode) => {
    if (visited.has(node)) {
      return;
    }
    visited.add(node);
    if (node.type === 'Identifier') {
      if (!allowServerItems.has(node.name) && !exportNames.has(node.name)) {
        allowServerDependencies.add(node.name);
      }
    }
    Object.values(node).forEach((value: unknown) => {
      (Array.isArray(value) ? value : [value]).forEach((v: unknown) => {
        if (isNode(v)) {
          findDependencies(v);
        }
      });
    });
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
          if (d.id.type === 'Identifier') {
            if (
              d.init?.type === 'CallExpression' &&
              d.init.callee.type === 'Identifier' &&
              d.init.callee.name === allowServer
            ) {
              const arg = getExpressionFromArguments(d.init.arguments);
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
          d.id.type === 'Identifier' &&
          d.init?.type === 'CallExpression' &&
          d.init.callee.type === 'Identifier' &&
          d.init.callee.name === allowServer
        ) {
          const arg = getExpressionFromArguments(d.init.arguments);
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
            d.id.type === 'Identifier' &&
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

const shouldKeepStatement = (stmt: BodyItem, dependencies: Set<string>) => {
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
      (d) => d.id.type === 'Identifier' && dependencies.has(d.id.name),
    );
  }
  const declId = getDeclarationId(stmt);
  if (declId) {
    return dependencies.has(declId.name);
  }
  return false;
};

const hasDirective = (mod: ProgramNode, directive: string) => {
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
};

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
        s.append(`\nexport const ${allowServerName} = ${expressionSource};`);
      }
      let newCode = s.toString().replace(/\n+/g, '\n');
      for (const name of exportNames) {
        const value = `() => { throw new Error('It is not possible to invoke a client function from the server: ${JSON.stringify(name)}') }`;
        newCode += `\nexport ${name === 'default' ? name : `const ${name} =`} ${value};`;
      }
      return '"use client";' + newCode.trim() + '\n';
    },
  };
}
