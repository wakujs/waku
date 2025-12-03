import { existsSync, readFileSync } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import * as swc from '@swc/core';
import type { Plugin } from 'vite';
import { EXTENSIONS, SRC_PAGES, SRC_SERVER_ENTRY } from '../constants.js';
import { getGrouplessPath } from '../utils/create-pages.js';
import { isIgnoredPath } from '../utils/fs-router.js';
import { joinPath } from '../utils/path.js';

// https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-names-and-keywords
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#identifiers
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#reserved_words
export function toIdentifier(input: string): string {
  // Strip the file extension
  let identifier = input.includes('.')
    ? input.split('.').slice(0, -1).join('.')
    : input;
  // Replace any characters besides letters, numbers, underscores, and dollar signs with underscores
  identifier = identifier.replace(/[^\p{L}\p{N}_$]/gu, '_');
  // Ensure it starts with a letter
  if (/^\d/.test(identifier)) {
    identifier = '_' + identifier;
  }
  // Turn it into PascalCase
  // Since the first letter is uppercased, it will not be a reserved word
  return (
    'File_' +
    identifier
      .split('_')
      .map((part) => {
        if (part[0] === undefined) {
          return '';
        }
        return part[0].toUpperCase() + part.slice(1);
      })
      .join('')
  );
}

export function getImportModuleNames(filePaths: string[]): {
  [k: string]: string;
} {
  const moduleNameCount: { [k: string]: number } = {};
  const moduleNames: { [k: string]: string } = {};
  for (const filePath of filePaths) {
    let identifier = toIdentifier(filePath);
    moduleNameCount[identifier] = (moduleNameCount[identifier] ?? -1) + 1;
    if (moduleNameCount[identifier]) {
      identifier = `${identifier}_${moduleNameCount[identifier]}`;
    }
    try {
      moduleNames[filePath.replace(/^\//, '')] = identifier;
    } catch (e) {
      console.log(e);
    }
  }
  return moduleNames;
}

export const fsRouterTypegenPlugin = (opts: { srcDir: string }): Plugin => {
  return {
    name: 'waku:vite-plugins:fs-router-typegen',
    apply: 'serve',
    configureServer(server) {
      const srcDir = joinPath(server.config.root, opts.srcDir);
      const pagesDir = joinPath(srcDir, SRC_PAGES);

      const outputFile = joinPath(srcDir, 'pages.gen.ts');
      const updateGeneratedFile = async (file: string | undefined) => {
        // skip when the changed file is the generated file itself
        if (file && outputFile.endsWith(file)) {
          return;
        }
        // skip when the entries file exists or pages dir does not exist
        if (!existsSync(pagesDir) || !(await detectFsRouterUsage(srcDir))) {
          return;
        }
        const generation = await generateFsRouterTypes(pagesDir);
        if (!generation) {
          // skip failures
          return;
        }
        await writeFile(outputFile, generation, 'utf-8');
      };

      server.watcher.on('change', async (file) => {
        await updateGeneratedFile(file);
      });
      server.watcher.on('add', async (file) => {
        await updateGeneratedFile(file);
      });
      server.watcher.on('unlink', async (file) => {
        await updateGeneratedFile(file);
      });
      void updateGeneratedFile(undefined);
    },
  };
};

export async function detectFsRouterUsage(srcDir: string): Promise<boolean> {
  const existingServerEntry = EXTENSIONS.map((ext) =>
    joinPath(srcDir, SRC_SERVER_ENTRY + ext),
  ).find((entriesFile) => existsSync(entriesFile));

  // managed mode if no entry
  if (!existingServerEntry) {
    return true;
  }

  try {
    const file = swc.parseSync(readFileSync(existingServerEntry, 'utf8'), {
      syntax: 'typescript',
      tsx: true,
    });

    const usesFsRouter = file.body.some((node) => {
      if (node.type === 'ImportDeclaration') {
        if (!node.source.value.startsWith('waku')) {
          return false;
        }
        return node.specifiers.some(
          (specifier) =>
            specifier.type === 'ImportSpecifier' &&
            (specifier.imported?.value === 'fsRouter' ||
              (!specifier.imported && specifier.local.value === 'fsRouter')),
        );
      }
      return false;
    });
    return usesFsRouter;
  } catch {
    return false;
  }
}

export async function generateFsRouterTypes(pagesDir: string) {
  // Recursively collect `.tsx` files in the given directory
  const collectFiles = async (
    dir: string,
    files: string[] = [],
  ): Promise<string[]> => {
    // TODO revisit recursive option for readdir once more stable
    // https://nodejs.org/docs/latest-v20.x/api/fs.html#direntparentpath
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = joinPath(dir, entry.name);
      if (entry.isDirectory()) {
        await collectFiles(fullPath, files);
      } else {
        if (entry.name.endsWith('.tsx')) {
          files.push(fullPath.slice(pagesDir.length));
        }
      }
    }
    return files;
  };

  const fileExportsGetConfig = (filePath: string) => {
    const file = swc.parseSync(readFileSync(pagesDir + filePath, 'utf8'), {
      syntax: 'typescript',
      tsx: true,
    });

    return file.body.some((node) => {
      if (node.type === 'ExportNamedDeclaration') {
        return node.specifiers.some(
          (specifier) =>
            specifier.type === 'ExportSpecifier' &&
            !specifier.isTypeOnly &&
            ((!specifier.exported && specifier.orig.value === 'getConfig') ||
              specifier.exported?.value === 'getConfig'),
        );
      }

      return (
        node.type === 'ExportDeclaration' &&
        ((node.declaration.type === 'VariableDeclaration' &&
          node.declaration.declarations.some(
            (decl) =>
              decl.id.type === 'Identifier' && decl.id.value === 'getConfig',
          )) ||
          (node.declaration.type === 'FunctionDeclaration' &&
            node.declaration.identifier.value === 'getConfig'))
      );
    });
  };

  const generateFile = (filePaths: string[]): string | null => {
    const fileInfo: { path: string; src: string; hasGetConfig: boolean }[] = [];
    const moduleNames = getImportModuleNames(filePaths);

    for (const filePath of filePaths) {
      // where to import the component from
      const src = filePath.replace(/^\//, '');
      let hasGetConfig = false;
      try {
        hasGetConfig = fileExportsGetConfig(filePath);
      } catch {
        return null;
      }

      if (
        filePath.endsWith('/_layout.tsx') ||
        isIgnoredPath(filePath.split('/'))
      ) {
        continue;
      } else if (filePath.endsWith('/index.tsx')) {
        const path = filePath.slice(0, -'/index.tsx'.length);
        fileInfo.push({
          path: getGrouplessPath(path) || '/',
          src,
          hasGetConfig,
        });
      } else {
        fileInfo.push({
          path: getGrouplessPath(filePath.replace('.tsx', '')),
          src,
          hasGetConfig,
        });
      }
    }

    let result = `// deno-fmt-ignore-file
// biome-ignore format: generated types do not need formatting
// prettier-ignore
import type { PathsForPages, GetConfigResponse } from 'waku/router';\n\n`;

    for (const file of fileInfo) {
      const moduleName = moduleNames[file.src];
      if (file.hasGetConfig) {
        result += `// prettier-ignore\nimport type { getConfig as ${moduleName}_getConfig } from './${SRC_PAGES}/${file.src.replace('.tsx', '')}';\n`;
      }
    }

    result += `\n// prettier-ignore\ntype Page =\n`;

    for (const file of fileInfo) {
      const moduleName = moduleNames[file.src];
      if (file.hasGetConfig) {
        result += `| ({ path: '${file.path}' } & GetConfigResponse<typeof ${moduleName}_getConfig>)\n`;
      } else {
        result += `| { path: '${file.path}'; render: 'dynamic' }\n`;
      }
    }

    result =
      result.slice(0, -1) +
      `;

// prettier-ignore
declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<Page>;
  }
  interface CreatePagesConfig {
    pages: Page;
  }
}
`;

    return result;
  };

  const files = await collectFiles(pagesDir);
  if (!files.length) {
    return;
  }
  const generation = generateFile(files);
  return generation;
}
