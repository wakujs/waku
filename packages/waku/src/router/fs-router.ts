import {
  unstable_getPlatformData,
  unstable_setPlatformData,
  unstable_getBuildOptions,
} from '../server.js';
import { createPages, METHODS } from './create-pages.js';
import type { Method } from './create-pages.js';

import { EXTENSIONS } from '../lib/builder/constants.js';
import { isIgnoredPath } from '../lib/utils/fs-router.js';
import * as virtualFsRouter from 'virtual:vite-rsc-waku/fs-router';

const DO_NOT_BUNDLE = '';

export function unstable_fsRouter(
  importMetaUrl: string,
  loadPage: (file: string) => Promise<any> | undefined,
  options: {
    /** e.g. `"pages"` will detect pages in `src/pages`. */
    pagesDir: string;
    /**
     * e.g. `"api"` will detect pages in `src/pages/api`. Or, if `options.pagesDir`
     * is `"foo"`, then it will detect pages in `src/foo/api`.
     */
    apiDir: string;
  },
) {
  const buildOptions = unstable_getBuildOptions();
  return createPages(
    async ({
      createPage,
      createLayout,
      createRoot,
      createApi,
      createPagePart,
      createSlice,
    }) => {
      // let files = await unstable_getPlatformData<string[]>('fsRouterFiles');
      // if (!files) {
      //   // dev and build only
      //   if (
      //     import.meta.env &&
      //     import.meta.env.MODE === 'production' &&
      //     !buildOptions.unstable_phase
      //   ) {
      //     throw new Error('files must be set in production.');
      //   }
      //   const [
      //     { readdir },
      //     { join, dirname, extname, sep },
      //     { fileURLToPath },
      //   ] = await Promise.all([
      //     import(/* @vite-ignore */ DO_NOT_BUNDLE + 'node:fs/promises'),
      //     import(/* @vite-ignore */ DO_NOT_BUNDLE + 'node:path'),
      //     import(/* @vite-ignore */ DO_NOT_BUNDLE + 'node:url'),
      //   ]);
      //   const pagesDir = join(
      //     dirname(fileURLToPath(importMetaUrl)),
      //     options.pagesDir,
      //   );
      //   files = await readdir(pagesDir, {
      //     encoding: 'utf8',
      //     recursive: true,
      //   });
      //   files = files!.flatMap((file) => {
      //     const myExt = extname(file);
      //     const myExtIndex = EXTENSIONS.indexOf(myExt);
      //     if (myExtIndex === -1) {
      //       return [];
      //     }
      //     // HACK: replace "_slug_" to "[slug]" for build
      //     file = file.replace(/(?<=^|\/|\\)_([^/]+)_(?=\/|\\|\.)/g, '[$1]');
      //     // For Windows
      //     file = sep === '/' ? file : file.replace(/\\/g, '/');
      //     // HACK: resolve different extensions for build
      //     const exts = [myExt, ...EXTENSIONS];
      //     exts.splice(myExtIndex + 1, 1); // remove the second myExt
      //     for (const ext of exts) {
      //       const f = file.slice(0, -myExt.length) + ext;
      //       if (loadPage(f)) {
      //         return [f];
      //       }
      //     }
      //     throw new Error('Failed to resolve ' + file);
      //   });
      // }
      const files = virtualFsRouter.files;
      // build only - skip in dev
      // if (buildOptions.unstable_phase) {
      //   await unstable_setPlatformData('fsRouterFiles', files, true);
      // }
      for (const file of files) {
        // const mod = await loadPage(file);
        const mod = await virtualFsRouter.loadPage(file);
        const config = await mod.getConfig?.();
        const pathItems = file
          .replace(/\.\w+$/, '')
          .split('/')
          .filter(Boolean);
        // must come before isIgnoredPath check to include slices from inside _components
        if (pathItems.at(-1)?.startsWith('_slice')) {
          createSlice({
            component: mod.default,
            render: 'dynamic',
            id: pathItems.at(-1)!.slice('_'.length),
            ...config,
          });
          continue;
        }
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
        } else if (pathItems.at(0) === virtualFsRouter.apiDir) {
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
              handler: mod.GET,
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
        } else if (pathItems.at(-1)?.startsWith('_part')) {
          createPagePart({
            path,
            component: mod.default,
            render: 'dynamic',
            ...config,
          });
        } else {
          createPage({
            path,
            component: mod.default,
            render: 'dynamic',
            ...config,
          });
        }
      }
      // HACK: to satisfy the return type, unused at runtime
      return null as never;
    },
  );
}
