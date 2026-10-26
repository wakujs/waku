import type { FunctionComponent, ReactNode } from 'react';
import type { ImportGlobFunction } from 'vite/types/importGlob.d.ts';
import type {
  CreateApi,
  CreateInterceptor,
  CreateLayout,
  CreatePage,
  CreateRoot,
  CreateSlice,
} from './create-pages.js';
import { isIgnoredPath } from './isomorphic-utils/route-path.js';

type DynamicApi = Extract<
  Parameters<CreateApi>[0],
  { render: 'dynamic'; handlers: object }
>;

const METHODS: Record<Exclude<keyof DynamicApi['handlers'], 'all'>, true> = {
  GET: true,
  HEAD: true,
  POST: true,
  PUT: true,
  DELETE: true,
  CONNECT: true,
  OPTIONS: true,
  TRACE: true,
  PATCH: true,
  QUERY: true,
};

declare global {
  interface ImportMeta {
    glob: ImportGlobFunction;
  }
}

/**
 * A mapping from a file path to a route module, e.g.
 *
 * ```js
 * {
 *   "./pages/_layout.tsx": () => ({ default: ... }),
 *   "./pages/index.tsx": () => ({ default: ... }),
 *   "./pages/foo/index.tsx": () => ...,
 * }
 * ```
 *
 * Intended to be created by Vite's import.meta.glob with the pages
 * directory included in the pattern, e.g.
 *
 * ```js
 * import.meta.glob("./pages/**\/*.{tsx,ts}")
 * ```
 */
export type FileRoutesModules = { [file: string]: () => Promise<unknown> };

export type FileRoutesOptions = {
  /**
   * The pages directory name. Must match the directory in the glob
   * pattern, e.g. `"pages"` for `import.meta.glob('./pages/**\/*')`.
   * Glob keys whose first segment doesn't match are ignored.
   * Defaults to `"pages"`.
   */
  pagesDir?: string;
  /** e.g. `"_api"` will detect pages in `src/pages/_api` and strip `_api` from the path. */
  apiDir?: string;
  /** e.g. `"_slices"` will detect slices in `src/pages/_slices`. */
  slicesDir?: string;
  /**
   * e.g. `"_interceptors"` will detect handler interceptors in
   * `src/pages/_interceptors`. Each module must default-export a
   * `HandlerInterceptor`.
   */
  interceptorsDir?: string;
};

export type Unstable_CreateFileRoutes = (
  modules: FileRoutesModules,
  options?: FileRoutesOptions,
) => Promise<void>;

export async function registerFileRoutes(
  {
    createPage,
    createLayout,
    createRoot,
    createApi,
    createSlice,
    createInterceptor,
  }: {
    createPage: CreatePage;
    createLayout: CreateLayout;
    createRoot: CreateRoot;
    createApi: CreateApi;
    createSlice: CreateSlice;
    createInterceptor: CreateInterceptor;
  },
  modules: FileRoutesModules,
  options: FileRoutesOptions = {},
): Promise<void> {
  const {
    pagesDir = 'pages',
    apiDir = '_api',
    slicesDir = '_slices',
    interceptorsDir = '_interceptors',
  } = options;
  const pagesDirPrefix = pagesDir + '/';
  for (const file of Object.keys(modules).sort()) {
    // Use WHATWG URL encoding for the file path (different from RFC2396-based encoding)
    const srcPath = new URL(file, 'http://localhost:3000').pathname.slice(1);
    if (!srcPath.startsWith(pagesDirPrefix)) {
      continue;
    }
    const pathItems = srcPath
      .slice(pagesDirPrefix.length)
      .replace(/\.\w+$/, '')
      .split('/')
      .filter(Boolean);
    if (isIgnoredPath(pathItems)) {
      continue;
    }
    if (pathItems.at(0) === interceptorsDir) {
      const interceptorMod = (await modules[file]!()) as {
        default: Parameters<CreateInterceptor>[0];
      };
      createInterceptor(interceptorMod.default);
      continue;
    }
    const mod = (await modules[file]!()) as {
      default: FunctionComponent<{ children: ReactNode }>;
      getConfig?: () => Promise<{
        render?: 'static' | 'dynamic';
        unstable_noSsr?: boolean;
        unstable_getEtag?: (props?: any) => Promise<string | undefined>;
        unstable_searchCodec?: Parameters<CreatePage>[0]['unstable_searchCodec'];
      }>;
      GET?: (req: Request) => Promise<Response>;
    };

    const config = await mod.getConfig?.();
    const path =
      '/' +
      (['_layout', 'index', '_root'].includes(pathItems.at(-1)!)
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
          unstable_sourceFile: srcPath,
        });
      } else {
        const validMethods = new Set(Object.keys(METHODS));
        const handlers = Object.fromEntries(
          Object.entries(mod).flatMap(([exportName, handler]) => {
            const isValidExport =
              exportName === 'getConfig' ||
              exportName === 'default' ||
              validMethods.has(exportName);
            if (!isValidExport) {
              console.warn(
                `API ${path} has an invalid export: ${exportName}. Valid exports are: ${Object.keys(
                  METHODS,
                ).join(', ')}`,
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
          unstable_sourceFile: srcPath,
        });
      }
    } else if (pathItems.at(0) === slicesDir) {
      createSlice({
        component: mod.default,
        render: 'static',
        id: pathItems.slice(1).join('/'),
        ...config,
        unstable_sourceFile: srcPath,
      } as never); // FIXME avoid as never
    } else if (pathItems.at(-1) === '_layout') {
      createLayout({
        path,
        component: mod.default,
        render: 'static',
        ...config,
        unstable_sourceFile: srcPath,
      });
    } else if (pathItems.at(-1) === '_root') {
      createRoot({
        component: mod.default,
        render: 'static',
        ...config,
        unstable_sourceFile: srcPath,
      });
    } else {
      createPage({
        path,
        component: mod.default,
        render: 'static',
        ...config,
        unstable_sourceFile: srcPath,
      } as never); // FIXME avoid as never
    }
  }
}
