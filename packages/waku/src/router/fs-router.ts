import type { FunctionComponent, ReactNode } from 'react';
import type { ImportGlobFunction } from 'vite/types/importGlob.d.ts';
import { UNSTABLE_PRUNABLE_SOURCE_FILES_METADATA_KEY } from '../lib/constants.js';
import { isIgnoredPath } from '../lib/utils/fs-router.js';
import { METHODS, createPages } from './create-pages.js';
import type { Method } from './create-pages.js';

declare global {
  interface ImportMeta {
    glob: ImportGlobFunction;
  }
}

let didWarnAboutApiDirMigration = false;

type FsRouterModule = {
  default: FunctionComponent<{ children: ReactNode }>;
  getConfig?: () => Promise<{
    render?: 'static' | 'dynamic';
  }>;
  GET?: (req: Request) => Promise<Response>;
};

type AnalyzedFile = {
  sourceFile: string;
  path: string;
  pathItems: string[];
  render: 'static' | 'dynamic';
  kind: 'page' | 'api' | 'layout' | 'root' | 'slice';
};

const getAncestorPaths = (routePath: string) => {
  const ancestors = ['/'];
  let current = '';
  for (const part of routePath.split('/').filter(Boolean)) {
    current += `/${part}`;
    ancestors.push(current);
  }
  return ancestors;
};

export function fsRouter(
  /**
   * A mapping from a file path to a route module, e.g.
   *   {
   *     "_layout.tsx": () => ({ default: ... }),
   *     "index.tsx": () => ({ default: ... }),
   *     "foo/index.tsx": () => ...,
   *   }
   * This mapping can be created by Vite's import.meta.glob, e.g.
   *   import.meta.glob("./**\/*.{tsx,ts}", { base: "./pages" })
   */
  pages: { [file: string]: () => Promise<unknown> },
  options?: {
    /** e.g. `"_api"` will detect pages in `src/pages/_api` and strip `_api` from the path. */
    apiDir?: string;
    /** e.g. `"_slices"` will detect slices in `src/pages/_slices`. */
    slicesDir?: string;
    unstable_skipBuild?: (routePath: string) => boolean;
  },
) {
  if (
    !didWarnAboutApiDirMigration &&
    !(options as any)?.temporary_doNotWarnAboutApiDirMigration
  ) {
    didWarnAboutApiDirMigration = true;
    // TODO: remove this warning after a few versions
    if (Object.keys(pages).some((file) => file.startsWith('./api/'))) {
      console.warn(
        '[fsRouter] Migration required (v1.0.0-alpha.1): Move "./api/" to "./_api/". To preserve the old "/api/*" URL paths, move to "./_api/api/". See https://github.com/wakujs/waku/pull/1885',
      );
    }
  }
  const {
    apiDir = '_api',
    slicesDir = '_slices',
    unstable_skipBuild,
  } = options || {};
  let builtPrunablePageFiles: Set<string> | undefined;
  let analyzedFilesPromise: Promise<AnalyzedFile[]> | undefined;
  const analyzeFiles = async () => {
    if (analyzedFilesPromise) {
      return analyzedFilesPromise;
    }
    analyzedFilesPromise = (async () => {
      const analyzedFiles: AnalyzedFile[] = [];
      for (const sourceFile of Object.keys(pages)) {
        const mod = (await pages[sourceFile]!()) as FsRouterModule;
        const decodedFile = new URL(
          sourceFile,
          'http://localhost:3000',
        ).pathname.slice(1);
        const pathItems = decodedFile
          .replace(/\.\w+$/, '')
          .split('/')
          .filter(Boolean);
        if (isIgnoredPath(pathItems)) {
          continue;
        }
        const path =
          '/' +
          (['_layout', 'index', '_root'].includes(pathItems.at(-1)!) ||
          pathItems.at(-1)?.startsWith('_part')
            ? pathItems.slice(0, -1)
            : pathItems
          ).join('/');
        const render = (await mod.getConfig?.())?.render ?? 'static';
        const kind =
          pathItems.at(-1) === '_layout'
            ? 'layout'
            : pathItems.at(-1) === '_root'
              ? 'root'
              : pathItems.at(0) === apiDir
                ? 'api'
                : pathItems.at(0) === slicesDir
                  ? 'slice'
                  : 'page';
        analyzedFiles.push({
          sourceFile,
          path,
          pathItems,
          render,
          kind,
        });
      }
      return analyzedFiles;
    })();
    return analyzedFilesPromise;
  };
  const getPrunableSourceFiles = async () => {
    const analyzedFiles = await analyzeFiles();
    const dynamicLayoutPaths = new Set(
      analyzedFiles
        .filter((file) => file.kind === 'layout' && file.render === 'dynamic')
        .map((file) => file.path),
    );
    const hasDynamicRoot = analyzedFiles.some(
      (file) => file.kind === 'root' && file.render === 'dynamic',
    );
    const prunableSourceFiles = new Set<string>();
    for (const file of analyzedFiles) {
      if (file.kind === 'api') {
        if (file.render === 'static') {
          prunableSourceFiles.add(file.sourceFile);
        }
        continue;
      }
      if (
        file.kind !== 'page' ||
        file.render !== 'static' ||
        file.path === '/404'
      ) {
        continue;
      }
      if (hasDynamicRoot) {
        continue;
      }
      if (
        getAncestorPaths(file.path).some((path) => dynamicLayoutPaths.has(path))
      ) {
        continue;
      }
      prunableSourceFiles.add(file.sourceFile);
    }
    return prunableSourceFiles;
  };
  const router = createPages(
    async ({
      createPage,
      createLayout,
      createRoot,
      createApi,
      createSlice,
    }) => {
      for (let file in pages) {
        if (builtPrunablePageFiles?.has(file)) {
          continue;
        }
        const mod = (await pages[file]!()) as {
          default: FunctionComponent<{ children: ReactNode }>;
          getConfig?: () => Promise<{
            render?: 'static' | 'dynamic';
          }>;
          GET?: (req: Request) => Promise<Response>;
        };

        // Use WHATWG URL encoding for the file path (different from RFC2396-based encoding)
        file = new URL(file, 'http://localhost:3000').pathname.slice(1);
        const config = await mod.getConfig?.();
        const pathItems = file
          .replace(/\.\w+$/, '')
          .split('/')
          .filter(Boolean);
        if (isIgnoredPath(pathItems)) {
          continue;
        }
        const path =
          '/' +
          (['_layout', 'index', '_root'].includes(pathItems.at(-1)!) ||
          pathItems.at(-1)?.startsWith('_part')
            ? pathItems.slice(0, -1)
            : pathItems
          ).join('/');
        if (pathItems.at(-1) === '[path]') {
          throw new Error(
            'Page file cannot be named [path]. This will conflict with the path prop of the page component.',
          );
        } else if (pathItems.at(0) === apiDir) {
          // Strip the apiDir prefix from the path (e.g., _api/hello.txt -> hello.txt)
          const apiPath = '/' + pathItems.slice(1).join('/');
          if (config?.render === 'static') {
            if (Object.keys(mod).length !== 2 || !mod.GET) {
              console.warn(
                `API ${path} is invalid. For static API routes, only a single GET handler is supported.`,
              );
            }
            createApi({
              ...config,
              path: apiPath,
              render: 'static',
              method: 'GET',
              handler: mod.GET!,
            });
          } else {
            const validMethods = new Set(METHODS);
            const handlers = Object.fromEntries(
              Object.entries(mod).flatMap(([exportName, handler]) => {
                const isValidExport =
                  exportName === 'getConfig' ||
                  exportName === 'default' ||
                  validMethods.has(exportName as Method);
                if (!isValidExport) {
                  console.warn(
                    `API ${path} has an invalid export: ${exportName}. Valid exports are: ${METHODS.join(
                      ', ',
                    )}`,
                  );
                }
                return isValidExport && exportName !== 'getConfig'
                  ? exportName === 'default'
                    ? [['all', handler]]
                    : [[exportName, handler]]
                  : [];
              }),
            );
            createApi({
              path: apiPath,
              render: 'dynamic',
              handlers,
            });
          }
        } else if (pathItems.at(0) === slicesDir) {
          createSlice({
            component: mod.default,
            render: 'static',
            id: pathItems.slice(1).join('/'),
            ...config,
          });
        } else if (pathItems.at(-1) === '_layout') {
          createLayout({
            path,
            component: mod.default,
            render: 'static',
            ...config,
          });
        } else if (pathItems.at(-1) === '_root') {
          createRoot({
            component: mod.default,
            render: 'static',
            ...config,
          });
        } else {
          createPage({
            path,
            component: mod.default,
            render: 'static',
            ...config,
          } as never); // FIXME avoid as never
        }
      }
      // HACK: to satisfy the return type, unused at runtime
      return null as never;
    },
    unstable_skipBuild ? { unstable_skipBuild } : undefined,
  );
  const originalHandleRequest = router.handleRequest;
  const originalHandleBuild = router.handleBuild;
  return Object.assign(router, {
    handleRequest: async (
      input: Parameters<typeof router.handleRequest>[0],
      utils: Parameters<typeof router.handleRequest>[1],
    ) => {
      if (!builtPrunablePageFiles) {
        try {
          const serialized = await utils.loadBuildMetadata(
            UNSTABLE_PRUNABLE_SOURCE_FILES_METADATA_KEY,
          );
          builtPrunablePageFiles = new Set<string>(
            serialized ? (JSON.parse(serialized) as string[]) : [],
          );
        } catch {
          builtPrunablePageFiles = new Set();
        }
      }
      return originalHandleRequest(input, utils);
    },
    handleBuild: async (utils: Parameters<typeof router.handleBuild>[0]) => {
      await originalHandleBuild(utils);
      const prunableSourceFiles = await getPrunableSourceFiles();
      await utils.saveBuildMetadata(
        UNSTABLE_PRUNABLE_SOURCE_FILES_METADATA_KEY,
        JSON.stringify(Array.from(prunableSourceFiles)),
      );
    },
  });
}
