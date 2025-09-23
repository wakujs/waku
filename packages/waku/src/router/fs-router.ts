import type { FunctionComponent, ReactNode } from 'react';

import {
  unstable_getConfig as getConfig,
  unstable_getModulesInSrcPages as getModulesInSrcPages,
} from '../server-utils.js';
import { createPages, METHODS } from './create-pages.js';
import type { Method } from './create-pages.js';
import { isIgnoredPath } from '../lib/utils/fs-router.js';

export function unstable_fsRouter(
  /**
   * A mapping from a file path to a route module, e.g.
   *   {
   *     "_layout.tsx": () => ({ default: ... }),
   *     "index.tsx": () => ({ default: ... }),
   *     "foo/index.tsx": () => ...,
   *   }
   * This mapping can be created by Vite's import.meta.glob, e.g.
   *   import.meta.glob("/src/pages/**\/*.tsx", { base: "/src/pages" })
   */
  pages = getModulesInSrcPages(),
  options: {
    /**
     * e.g. `"api"` will detect pages in `src/pages/api`. Or, if `options.pagesDir`
     * is `"foo"`, then it will detect pages in `src/foo/api`.
     */
    apiDir: string;
    /** e.g. `"_slices"` will detect slices in `src/pages/_slices`. */
    slicesDir: string;
  } = getConfig(),
) {
  return createPages(
    async ({
      createPage,
      createLayout,
      createRoot,
      createApi,
      createSlice,
    }) => {
      for (let file in pages) {
        const mod = (await pages[file]!()) as {
          default: FunctionComponent<{ children: ReactNode }>;
          getConfig?: () => Promise<{
            render?: 'static' | 'dynamic';
          }>;
          GET?: (req: Request) => Promise<Response>;
        };
        // strip "./" prefix
        file = file.replace(/^\.\//, '');
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
        } else if (pathItems.at(0) === options.apiDir) {
          if (config?.render === 'static') {
            if (Object.keys(mod).length !== 2 || !mod.GET) {
              console.warn(
                `API ${path} is invalid. For static API routes, only a single GET handler is supported.`,
              );
            }
            createApi({
              path: pathItems.join('/'),
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
              path: pathItems.join('/'),
              render: 'dynamic',
              handlers,
            });
          }
        } else if (pathItems.at(0) === options.slicesDir) {
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
  );
}
