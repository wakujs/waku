import MagicString from 'magic-string';
import type { Plugin } from 'vite';
import { parseAstAsync } from 'vite';

type ProgramNode = Awaited<ReturnType<typeof parseAstAsync>>;

type BaseNode = { type: string };
type Super = BaseNode & { type: 'Super' };
type Identifier = BaseNode & { type: 'Identifier'; name: string };
type Literal = BaseNode & { type: 'Literal'; value?: unknown };
type ImportSpecifier = BaseNode & {
  type: 'ImportSpecifier';
  imported: Identifier | Literal;
  local: Identifier;
};
type ExportSpecifier = BaseNode & {
  type: 'ExportSpecifier';
  local: Identifier | Literal;
  exported: Identifier | Literal;
};
type ImportDeclaration = BaseNode & {
  type: 'ImportDeclaration';
  source: Literal;
  specifiers: ImportSpecifier[];
};
type Expression = BaseNode & { value: unknown };
type SpreadElement = BaseNode & { type: 'SpreadElement'; argument: Expression };
type CallExpression = BaseNode & {
  type: 'CallExpression';
  callee: Expression | Super;
  arguments: (Expression | SpreadElement)[];
};
type VariableDeclarator = BaseNode & { id: Identifier; init?: Expression };
type VariableDeclaration = BaseNode & {
  type: 'VariableDeclaration';
  declarations: VariableDeclarator[];
};
type FunctionDeclaration = BaseNode & {
  type: 'FunctionDeclaration';
  id: Identifier;
};
type ClassDeclaration = BaseNode & { type: 'ClassDeclaration'; id: Identifier };
type ExpressionStatement = BaseNode & {
  type: 'ExpressionStatement';
  expression: Expression;
};

const isNode = (value: unknown): value is BaseNode =>
  typeof (value as { type?: unknown })?.type === 'string'; // heuristic

const isNodeWithRange = (
  node: BaseNode,
): node is BaseNode & { start: number; end: number } =>
  typeof (node as { start?: unknown })?.start === 'number' &&
  typeof (node as { end?: unknown })?.end === 'number';

const isIdentifier = (node: BaseNode): node is Identifier =>
  node.type === 'Identifier';

const isSpreadElement = (node: BaseNode): node is SpreadElement =>
  node.type === 'SpreadElement';

const isCallExpression = (node: BaseNode): node is CallExpression =>
  node.type === 'CallExpression';

const isImportDeclaration = (node: BaseNode): node is ImportDeclaration =>
  node.type === 'ImportDeclaration';

const isVariableDeclaration = (node: BaseNode): node is VariableDeclaration =>
  node.type === 'VariableDeclaration';

const isExpressionStatement = (node: BaseNode): node is ExpressionStatement =>
  node.type === 'ExpressionStatement';

const isFunctionDeclaration = (node: BaseNode): node is FunctionDeclaration =>
  node.type === 'FunctionDeclaration';

const isClassDeclaration = (node: BaseNode): node is ClassDeclaration =>
  node.type === 'ClassDeclaration';

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
  const argument = isSpreadElement(arg) ? arg.argument : arg;
  if (!isNodeWithRange(argument)) {
    throw new Error('Missing range');
  }
  return argument;
};

const isUseDirective = (stmt: BaseNode, directive: string) =>
  isExpressionStatement(stmt) &&
  stmt.expression.type === 'Literal' &&
  stmt.expression.value === directive;

const getDeclarationId = (item: BaseNode) =>
  (isFunctionDeclaration(item) || isClassDeclaration(item)) &&
  isIdentifier(item.id) &&
  item.id;

const transformExportedClientThings = (mod: ProgramNode) => {
  const exportNames = new Set<string>();
  // HACK this doesn't cover all cases
  const allowServerItems = new Map<
    string,
    Expression & { start: number; end: number }
  >();
  const allowServerDependencies = new Set<string>();
  const visited = new WeakSet<BaseNode>();
  const findDependencies = (node: BaseNode) => {
    if (visited.has(node)) {
      return;
    }
    visited.add(node);
    if (isIdentifier(node)) {
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
      isImportDeclaration(item) &&
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
      } else if (item.declaration && isVariableDeclaration(item.declaration)) {
        for (const d of item.declaration.declarations) {
          if (isIdentifier(d.id)) {
            if (
              d.init &&
              isCallExpression(d.init) &&
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
    } else if (isVariableDeclaration(item)) {
      for (const d of item.declarations) {
        if (
          isIdentifier(d.id) &&
          d.init &&
          isCallExpression(d.init) &&
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
      if (isVariableDeclaration(item)) {
        for (const d of item.declarations) {
          if (isIdentifier(d.id) && allowServerDependencies.has(d.id.name)) {
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

const shouldKeepStatement = (stmt: BaseNode, dependencies: Set<string>) => {
  if (isImportDeclaration(stmt)) {
    return stmt.specifiers.some(
      (s) =>
        s.type === 'ImportSpecifier' &&
        (dependencies.has(getImportedName(s)) ||
          dependencies.has(s.local.name)),
    );
  }
  if (isVariableDeclaration(stmt)) {
    return stmt.declarations.some(
      (d) => isIdentifier(d.id) && dependencies.has(d.id.name),
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
