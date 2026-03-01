import fs from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { EXTENSIONS, SRC_MIDDLEWARE, SRC_PAGES } from '../constants.js';

type ManagedServerEntryMode = 'runtime' | 'build';

const toPosix = (p: string) => p.split(path.sep).join('/');

const GET_CONFIG_EXPORT_PATTERNS = [
  /export\s+(?:async\s+)?function\s+getConfig\b/m,
  /export\s+(?:const|let|var)\s+getConfig\b/m,
  /export\s*\{[^}]*\bgetConfig\b[^}]*\}/m,
];

const HAS_DYNAMIC_RENDER_LITERAL_PATTERN = /render\s*:\s*['"]dynamic['"]/m;
const HAS_STATIC_RENDER_LITERAL_PATTERN = /render\s*:\s*['"]static['"]/m;

const hasGetConfigExport = (code: string) =>
  GET_CONFIG_EXPORT_PATTERNS.some((pattern) => pattern.test(code));

const collectPageFiles = async (
  dir: string,
  baseDir: string,
): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectPageFiles(fullPath, baseDir)));
      continue;
    }
    if (!EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      continue;
    }
    files.push(toPosix(path.relative(baseDir, fullPath)));
  }
  return files;
};

const getRuntimeExcludedPageFiles = async ({
  rootDir,
  srcDir,
  apiDir = '_api',
  slicesDir = '_slices',
}: {
  rootDir: string;
  srcDir: string;
  apiDir?: string;
  slicesDir?: string;
}) => {
  const pagesDir = path.join(rootDir, srcDir, SRC_PAGES);
  if (!fs.existsSync(pagesDir)) {
    return [] as string[];
  }
  const files = await collectPageFiles(pagesDir, pagesDir);
  const excluded: string[] = [];
  for (const file of files) {
    const parts = file.split('/');
    const stem = parts[parts.length - 1]!.replace(/\.[^.]+$/, '');
    if (
      parts[0] === apiDir ||
      parts[0] === slicesDir ||
      stem === '_layout' ||
      stem === '_root'
    ) {
      continue;
    }
    const code = await readFile(path.join(pagesDir, file), 'utf8');
    if (!hasGetConfigExport(code)) {
      excluded.push(file);
      continue;
    }
    if (HAS_DYNAMIC_RENDER_LITERAL_PATTERN.test(code)) {
      continue;
    }
    if (HAS_STATIC_RENDER_LITERAL_PATTERN.test(code)) {
      excluded.push(file);
      continue;
    }
  }
  return excluded;
};

export const getManagedServerEntry = async ({
  srcDir,
  rootDir,
  mode,
}: {
  srcDir: string;
  rootDir: string;
  mode: ManagedServerEntryMode;
}) => {
  const globBase = `/${srcDir}/${SRC_PAGES}`;
  const exts = EXTENSIONS.map((ext) => ext.slice(1)).join(',');
  const fullPagesGlobPattern = `${globBase}/**/*.{${exts}}`;
  let pagesGlob: string | string[] = fullPagesGlobPattern;
  if (mode === 'runtime') {
    const excludedPageFiles = await getRuntimeExcludedPageFiles({
      rootDir,
      srcDir,
    });
    if (excludedPageFiles.length) {
      pagesGlob = [
        fullPagesGlobPattern,
        ...excludedPageFiles.map((file) => `!${globBase}/${toPosix(file)}`),
      ];
    }
  }
  const middlewareGlob = [
    `/${srcDir}/${SRC_MIDDLEWARE}/*.{${exts}}`,
    `!/${srcDir}/${SRC_MIDDLEWARE}/*.{test,spec}.{${exts}}`,
  ];
  return `
import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';

export default adapter(
  fsRouter(
    import.meta.glob(
      ${JSON.stringify(pagesGlob)},
      { base: ${JSON.stringify(globBase)} }
    )
  ),
  {
    middlewareModules: import.meta.glob(${JSON.stringify(middlewareGlob)}),
  },
);
`;
};

export const getManagedClientEntry = () => {
  return `
import { StrictMode, createElement } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Router } from 'waku/router/client';

const rootElement = createElement(StrictMode, null, createElement(Router));

if (globalThis.__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement);
} else {
  createRoot(document).render(rootElement);
}
`;
};
