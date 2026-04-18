import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { parse, transformWithOxc } from 'vite';
import { EXTENSIONS, SRC_PAGES } from '../constants.js';
import { isIgnoredPath } from './fs-router.js';
import { joinPath } from './path.js';

type RenderMode = 'static' | 'dynamic';

const getLang = (filePath: string): 'jsx' | 'ts' | 'tsx' => {
  if (filePath.endsWith('.tsx')) {
    return 'tsx';
  }
  if (filePath.endsWith('.ts') || filePath.endsWith('.mts')) {
    return 'ts';
  }
  return 'jsx';
};

const parseModule = async (filePath: string) => {
  const source = readFileSync(filePath, 'utf8');
  const lang = getLang(filePath);
  const transformed = await transformWithOxc(source, filePath, {
    lang,
    jsx: 'preserve',
  });
  return (await parse(filePath, transformed.code, { lang } as never)).program;
};

const getPropertyName = (property: any): string | undefined => {
  if (
    property.key?.type === 'Identifier' ||
    property.key?.type === 'PrivateIdentifier'
  ) {
    return property.key.name;
  }
  if (
    property.key?.type === 'Literal' &&
    typeof property.key.value === 'string'
  ) {
    return property.key.value;
  }
  return undefined;
};

const unwrapExpression = (expression: any): any => {
  let current = expression;
  while (current) {
    if (
      current.type === 'TSAsExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'ParenthesizedExpression'
    ) {
      current = current.expression;
      continue;
    }
    return current;
  }
  return current;
};

const getLiteralRenderMode = (expression: any): RenderMode | undefined => {
  const unwrapped = unwrapExpression(expression);
  if (unwrapped?.type !== 'ObjectExpression') {
    return undefined;
  }
  for (const property of unwrapped.properties) {
    if (property.type !== 'Property' || property.kind !== 'init') {
      continue;
    }
    if (getPropertyName(property) !== 'render') {
      continue;
    }
    const value = unwrapExpression(property.value);
    if (
      value?.type === 'Literal' &&
      (value.value === 'static' || value.value === 'dynamic')
    ) {
      return value.value;
    }
    return undefined;
  }
  return undefined;
};

const getReturnedRenderMode = (body: any): RenderMode | undefined => {
  const unwrapped = unwrapExpression(body);
  if (!unwrapped) {
    return undefined;
  }
  if (unwrapped.type === 'ObjectExpression') {
    return getLiteralRenderMode(unwrapped);
  }
  if (unwrapped.type !== 'BlockStatement') {
    return undefined;
  }
  for (const statement of unwrapped.body) {
    if (statement.type === 'ReturnStatement') {
      return getLiteralRenderMode(statement.argument);
    }
  }
  return undefined;
};

const getExportedGetConfigRenderMode = (
  program: any,
): RenderMode | undefined => {
  for (const node of program.body) {
    if (node.type !== 'ExportNamedDeclaration') {
      continue;
    }
    if (node.declaration?.type === 'FunctionDeclaration') {
      if (node.declaration.id?.name !== 'getConfig') {
        continue;
      }
      return getReturnedRenderMode(node.declaration.body);
    }
    if (node.declaration?.type === 'VariableDeclaration') {
      for (const declaration of node.declaration.declarations) {
        if (
          declaration.id?.type !== 'Identifier' ||
          declaration.id.name !== 'getConfig'
        ) {
          continue;
        }
        const init = declaration.init;
        if (
          init?.type === 'ArrowFunctionExpression' ||
          init?.type === 'FunctionExpression'
        ) {
          return getReturnedRenderMode(init.body);
        }
      }
    }
  }
  return undefined;
};

const isManagedRouteLeafFile = (relativeFilePath: string) => {
  const noExtension = relativeFilePath.replace(/\.[^./]+$/, '');
  const segments = noExtension.split('/').filter(Boolean);
  if (!segments.length || isIgnoredPath(segments)) {
    return false;
  }
  if (segments[0] === '_api' || segments[0] === '_slices') {
    return false;
  }
  const leaf = segments.at(-1);
  return leaf !== '_layout' && leaf !== '_root';
};

const collectFiles = async (
  dir: string,
  result: string[] = [],
): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = joinPath(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(fullPath, result);
      continue;
    }
    if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      result.push(fullPath);
    }
  }
  return result;
};

const getManagedRouteFileRenderMode = async (
  filePath: string,
): Promise<RenderMode | undefined> => {
  const program = await parseModule(filePath);
  return getExportedGetConfigRenderMode(program) ?? 'static';
};

export const getManagedRuntimeExcludes = async ({
  rootDir,
  srcDir,
}: {
  rootDir: string;
  srcDir: string;
}): Promise<string[]> => {
  const pagesDir = joinPath(rootDir, srcDir, SRC_PAGES);
  if (!existsSync(pagesDir)) {
    return [];
  }
  const excludes: string[] = [];
  const files = await collectFiles(pagesDir);
  for (const filePath of files) {
    const relativeFilePath = filePath.slice(pagesDir.length + 1);
    if (!isManagedRouteLeafFile(relativeFilePath)) {
      continue;
    }
    const renderMode = await getManagedRouteFileRenderMode(filePath).catch(
      () => undefined,
    );
    if (renderMode === 'static') {
      excludes.push(`!/${srcDir}/${SRC_PAGES}/${relativeFilePath}`);
    }
  }
  return excludes;
};
