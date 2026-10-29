import type {
  FileRoutesModules,
  FileRoutesOptions,
} from './create-file-routes.js';
import { createFileRoutes } from './create-file-routes.js';
import { createPages } from './create-pages.js';

export function fsRouter(
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
  modules: FileRoutesModules,
  {
    unstable_skipBuild,
    ...fileRoutesOptions
  }: FileRoutesOptions & {
    unstable_skipBuild?: (routePath: string) => boolean;
  } = {},
) {
  return createPages(
    async (fns) => {
      await createFileRoutes(fns, modules, fileRoutesOptions);
      // File route types are supplied by type generation.
      // HACK: to satisfy the return type, unused at runtime
      return null as never;
    },
    unstable_skipBuild ? { unstable_skipBuild } : undefined,
  );
}
