import { createElement, Fragment } from 'react';
import type { FunctionComponent, ReactNode } from 'react';

import { type RouterConfig, unstable_defineRouter } from './define-router.js';
import {
  parsePathWithSlug,
  getPathMapping,
  parseExactPath,
} from '../lib/utils/path.js';
import { getGrouplessPath } from '../lib/utils/create-pages.js';
import type { PathSpec } from '../lib/utils/path.js';
import type {
  AnyPage,
  GetSlugs,
  PropsForLayouts,
  PropsForPages,
} from './create-pages-utils/inferred-path-types.js';
import { Children, Slot } from '../minimal/client.js';
import { ErrorBoundary } from './client.js';

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
export const METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'DELETE',
  'CONNECT',
  'OPTIONS',
  'TRACE',
  'PATCH',
] as const;
export type Method = (typeof METHODS)[number];

function normalizeStaticPaths(
  staticPaths: readonly string[] | readonly string[][],
): string[][] {
  return staticPaths.map((item) =>
    (Array.isArray(item) ? item : [item]).map((slug) =>
      slug.replace(/\./g, '').replace(/ /g, '-'),
    ),
  );
}

// createPages API (a wrapper around unstable_defineRouter)

/** Assumes that the path is a part of a slug path. */
type IsValidPathItem<T> = T extends `/${string}` | '[]' | '' ? false : true;
/**
 * This is a helper type to check if a path is valid in a slug path.
 */
export type IsValidPathInSlugPath<T> = T extends `/${infer L}/${infer R}`
  ? IsValidPathItem<L> extends true
    ? IsValidPathInSlugPath<`/${R}`>
    : false
  : T extends `/${infer U}`
    ? IsValidPathItem<U>
    : false;
/** Checks if a particular slug name exists in a path. */
export type HasSlugInPath<T, K extends string> = T extends `/[${K}]/${infer _}`
  ? true
  : T extends `/${infer _}/${infer U}`
    ? HasSlugInPath<`/${U}`, K>
    : T extends `/[${K}]`
      ? true
      : false;

export type HasWildcardInPath<T> = T extends `/[...${string}]/${string}`
  ? true
  : T extends `/${infer _}/${infer U}`
    ? HasWildcardInPath<`/${U}`>
    : T extends `/[...${string}]`
      ? true
      : false;

export type PathWithSlug<T, K extends string> =
  IsValidPathInSlugPath<T> extends true
    ? HasSlugInPath<T, K> extends true
      ? T
      : never
    : never;

export type StaticSlugRoutePathsTuple<
  T extends string,
  Slugs extends unknown[] = GetSlugs<T>,
  Result extends readonly string[] = [],
> = Slugs extends []
  ? Result
  : Slugs extends [infer _, ...infer Rest]
    ? StaticSlugRoutePathsTuple<T, Rest, readonly [...Result, string]>
    : never;

type StaticSlugRoutePaths<T extends string> =
  HasWildcardInPath<T> extends true
    ? readonly string[] | readonly string[][]
    : StaticSlugRoutePathsTuple<T> extends readonly [string]
      ? readonly string[]
      : StaticSlugRoutePathsTuple<T>[];

/** Remove Slug from Path */
export type PathWithoutSlug<T> = T extends '/'
  ? T
  : IsValidPathInSlugPath<T> extends true
    ? HasSlugInPath<T, string> extends true
      ? never
      : T
    : never;

type PathWithStaticSlugs<T extends string> = T extends `/`
  ? T
  : IsValidPathInSlugPath<T> extends true
    ? T
    : never;

export type PathWithWildcard<
  Path,
  SlugKey extends string,
  WildSlugKey extends string,
> = PathWithSlug<Path, SlugKey | `...${WildSlugKey}`>;

export type CreatePage = <
  Path extends string,
  SlugKey extends string,
  WildSlugKey extends string,
  Render extends 'static' | 'dynamic',
  StaticPaths extends StaticSlugRoutePaths<Path>,
  ExactPath extends boolean | undefined = undefined,
  Slices extends string[] = [],
>(
  page: (
    | {
        render: Extract<Render, 'static'>;
        path: PathWithoutSlug<Path>;
        component: FunctionComponent<PropsForPages<Path>>;
      }
    | ({
        render: Extract<Render, 'static'>;
        path: PathWithStaticSlugs<Path>;
        component: FunctionComponent<PropsForPages<Path>>;
      } & (ExactPath extends true ? {} : { staticPaths: StaticPaths }))
    | {
        render: Extract<Render, 'dynamic'>;
        path: PathWithoutSlug<Path>;
        component: FunctionComponent<PropsForPages<Path>>;
      }
    | {
        render: Extract<Render, 'dynamic'>;
        path: PathWithWildcard<Path, SlugKey, WildSlugKey>;
        component: FunctionComponent<PropsForPages<Path>>;
      }
  ) & {
    unstable_disableSSR?: boolean;
    /**
     * If true, the path will be matched exactly, without wildcards or slugs.
     * This is intended for extending support to create custom routers.
     */
    exactPath?: ExactPath;
    /**
     * List of slice ids used in the component.
     * This is _required_ to send the slices along with the component.
     */
    slices?: Slices;
  },
) => Omit<
  Exclude<typeof page, { path: never } | { render: never }>,
  'unstable_disableSSR'
>;

export type CreateLayout = <Path extends string>(
  layout:
    | {
        render: 'dynamic';
        path: Path;
        component: FunctionComponent<
          PropsForLayouts<Path> & {
            /**
             * @deprecated use slugs instead, this will no longer be provided on future versions.
             */
            path: string;
          }
        >;
      }
    | {
        render: 'static';
        path: Path;
        component: FunctionComponent<PropsForLayouts<Path>>;
        staticPaths?: StaticSlugRoutePaths<Path>;
      },
) => void;

type ApiHandler = (req: Request) => Promise<Response>;

export type CreateApi = <Path extends string>(
  params:
    | {
        render: 'static';
        path: Path;
        method: 'GET';
        handler: ApiHandler;
      }
    | {
        render: 'dynamic';
        path: Path;
        /**
         * Handlers by named method. Use `all` to handle all methods.
         * Named methods will take precedence over `all`.
         */
        handlers: Partial<Record<Method | 'all', ApiHandler>>;
      },
) => void;

export type CreateSlice = <ID extends string>(slice: {
  render: 'static' | 'dynamic';
  id: ID;
  component: FunctionComponent<{ children: ReactNode }>;
}) => void;

type RootItem = {
  render: 'static' | 'dynamic';
  component: FunctionComponent<{ children: ReactNode }>;
};

export type CreateRoot = (root: RootItem) => void;

/**
 * Root component for all pages
 * ```tsx
 *   <html>
 *     <head></head>
 *     <body>{children}</body>
 *   </html>
 * ```
 */
const DefaultRoot = ({ children }: { children: ReactNode }) =>
  createElement(
    ErrorBoundary,
    null,
    createElement(
      'html',
      null,
      createElement('head', null),
      createElement('body', null, children),
    ),
  );

const createNestedElements = (
  elements: {
    component: FunctionComponent<any>;
    props?: Record<string, unknown>;
  }[],
  children: ReactNode,
) => {
  return elements.reduceRight<ReactNode>(
    (result, element) =>
      createElement(element.component, element.props, result),
    children,
  );
};

interface PageInfo {
  spec: PathSpec;
  component: FunctionComponent<any>;
  layouts: LayoutInfo[];
  isDynamic: boolean;
}

interface LayoutInfo {
  path: string;
  spec: PathSpec;
  component: FunctionComponent<any>;
  isDynamic: boolean;

  staticPaths?: string[][] | undefined;
  staticSlotIds: string[];
}

const routePriorityComparator = (
  a: {
    path: PathSpec;
    type: 'route' | 'api';
  },
  b: {
    path: PathSpec;
    type: 'route' | 'api';
  },
) => {
  const aPath = a.path;
  const bPath = b.path;
  const aPathLength = aPath.length;
  const bPathLength = bPath.length;
  const aHasWildcard = aPath.at(-1)?.type === 'wildcard';
  const bHasWildcard = bPath.at(-1)?.type === 'wildcard';

  // Compare path lengths first (longer paths are more specific)
  if (aPathLength !== bPathLength) {
    return aPathLength > bPathLength ? -1 : 1;
  }

  // If path lengths are equal, compare wildcard presence
  // sort the route without the wildcard higher, to check it earlier
  if (aHasWildcard !== bHasWildcard) {
    return aHasWildcard ? 1 : -1;
  }

  // If all else is equal, routes have the same priority
  return 0;
};

export const createPages = <
  AllPages extends (AnyPage | ReturnType<CreateLayout>)[],
>(
  fn: (fns: {
    createPage: CreatePage;
    createLayout: CreateLayout;
    createRoot: CreateRoot;
    createApi: CreateApi;
    createSlice: CreateSlice;
  }) => Promise<AllPages>,
) => {
  let configured = false;

  // layout lookups retain (group) path and pathMaps store without group
  // paths are stored without groups to easily detect duplicates
  const groupPathLookup = new Map<string, string>();
  const pagePathMap = new Map<string, PageInfo>();
  // static path and its linked static page
  const staticPagePathMap = new Map<
    string,
    {
      literalSpec: PathSpec;
      // use this path to find the corresponding page in `pagePathMap`
      originalPath: string;
    }
  >();
  // static layouts grouped by slot id
  const staticLayoutMap = new Map<string, LayoutInfo>();
  // layouts that's yet to be attached to pages
  const unattachedLayouts = new Map<string, LayoutInfo>();
  const apiPathMap = new Map<
    string, // `${method} ${path}`
    {
      render: 'static' | 'dynamic';
      pathSpec: PathSpec;
      handlers: Partial<Record<Method | 'all', ApiHandler>>;
    }
  >();
  const slicePathMap = new Map<string, string[]>();
  const sliceIdMap = new Map<
    string,
    {
      component: FunctionComponent<{ children: ReactNode }>;
      isStatic: boolean;
    }
  >();
  let rootItem: RootItem | undefined = undefined;
  const noSsrSet = new WeakSet<PathSpec>();

  /** helper to find dynamic path when slugs are used */
  const getPageRoutePath: (path: string) => string | undefined = (path) => {
    const staticPath = staticPagePathMap.get(path);
    if (staticPath) {
      return staticPath.originalPath;
    }

    for (const p of pagePathMap.keys()) {
      const grouplessSpec = getGrouplessPathSpec(parsePathWithSlug(p));

      if (getPathMapping(grouplessSpec, path)) {
        return p;
      }
    }
  };

  const getApiRoutePath: (
    path: string,
    method: string,
  ) => string | undefined = (path, method) => {
    const apiConfigEntries = Array.from(apiPathMap.entries()).sort(
      ([, a], [, b]) =>
        routePriorityComparator(
          { path: a.pathSpec, type: 'api' },
          { path: b.pathSpec, type: 'api' },
        ),
    );
    for (const [p, v] of apiConfigEntries) {
      if (
        (method in v.handlers || v.handlers.all) &&
        getPathMapping(getGrouplessPathSpec(parsePathWithSlug(p!)), path)
      ) {
        return p;
      }
    }
  };

  const pagePathExists = (path: string) => {
    for (const pathKey of apiPathMap.keys()) {
      const [_m, p] = pathKey.split(' ');
      if (p === path) {
        return true;
      }
    }
    return staticPagePathMap.has(path) || pagePathMap.has(path);
  };

  const isAllElementsStatic = (
    elements: Record<string, { isStatic?: boolean }>,
  ) => Object.values(elements).every((element) => element.isStatic);

  const isAllSlicesStatic = (path: string) =>
    (slicePathMap.get(path) || []).every(
      (sliceId) => sliceIdMap.get(sliceId)?.isStatic,
    );

  const registerGrouplessPath = (grouplessPath: string, path: string) => {
    if (grouplessPath === path) {
      return;
    }

    if (groupPathLookup.has(grouplessPath)) {
      throw new Error(`Duplicated path: ${path}`);
    }

    groupPathLookup.set(grouplessPath, path);
  };

  const createPage: CreatePage = (page) => {
    if (configured) {
      throw new Error('createPage no longer available');
    }
    if (pagePathExists(page.path)) {
      throw new Error(`Duplicated path: ${page.path}`);
    }

    const spec = page.exactPath
      ? parseExactPath(page.path)
      : parsePathWithSlug(page.path);
    if (page.unstable_disableSSR) {
      noSsrSet.add(spec);
    }

    // generate static path map
    if (page.render === 'static') {
      const { numSlugs, numWildcards } = countSlugsAndWildcards(spec);

      if (page.exactPath) {
        staticPagePathMap.set(page.path, {
          literalSpec: spec,
          originalPath: page.path,
        });
      } else if (numSlugs === 0 && numWildcards === 0) {
        const grouplessPath = getGrouplessPath(page.path);

        staticPagePathMap.set(grouplessPath, {
          literalSpec: spec,
          originalPath: page.path,
        });
        registerGrouplessPath(grouplessPath, page.path);
      } else if ('staticPaths' in page) {
        const staticPaths = normalizeStaticPaths(page.staticPaths);

        for (const staticPath of staticPaths) {
          const mapping = getMappingFromStaticPath(spec, staticPath, true);
          const pathItems: string[] = [];
          for (const { type, name } of spec) {
            switch (type) {
              case 'literal':
                pathItems.push(name);
                break;
              case 'group':
                pathItems.push(mapping[name!] as string);
                break;
              case 'wildcard':
                pathItems.push(...(mapping[name!] as string[]));
                break;
            }
          }

          staticPagePathMap.set(getGrouplessPath('/' + pathItems.join('/')), {
            literalSpec: pathItems.map((name) => ({ type: 'literal', name })),
            originalPath: page.path,
          });
        }

        registerGrouplessPath(getGrouplessPath(page.path), page.path);
      } else {
        throw new Error(
          `Missing 'staticPaths' in a static page: ${page.path}.`,
        );
      }
    }

    pagePathMap.set(page.path, {
      spec,
      component: page.component,
      isDynamic: page.render === 'dynamic',
      layouts: [],
    });
    if (page.slices?.length) {
      slicePathMap.set(page.path, page.slices);
    }
    return page as Exclude<typeof page, { path: never } | { render: never }>;
  };

  const createLayout: CreateLayout = (layout) => {
    if (configured) {
      throw new Error('createLayout no longer available');
    }

    if (unattachedLayouts.has(layout.path)) {
      throw new Error(`Duplicated layout path: ${layout.path}`);
    }

    const pathSpec = parsePathWithSlug(layout.path);
    unattachedLayouts.set(layout.path, {
      path: layout.path,
      spec: pathSpec,
      component: layout.component,
      isDynamic: layout.render === 'dynamic',
      staticSlotIds: [],
      staticPaths:
        layout.render === 'static' && layout.staticPaths
          ? normalizeStaticPaths(layout.staticPaths)
          : undefined,
    });
  };

  const createApi: CreateApi = (options) => {
    if (configured) {
      throw new Error('createApi no longer available');
    }
    if (apiPathMap.has(options.path)) {
      throw new Error(`Duplicated api path: ${options.path}`);
    }
    const pathSpec = parsePathWithSlug(options.path);
    if (options.render === 'static') {
      apiPathMap.set(options.path, {
        render: 'static',
        pathSpec,
        handlers: { GET: options.handler },
      });
    } else {
      apiPathMap.set(options.path, {
        render: 'dynamic',
        pathSpec,
        handlers: options.handlers,
      });
    }
  };

  const createRoot: CreateRoot = (root) => {
    if (configured) {
      throw new Error('createRoot no longer available');
    }
    if (rootItem) {
      throw new Error(`Duplicated root component`);
    }
    if (root.render === 'static' || root.render === 'dynamic') {
      rootItem = root;
    } else {
      throw new Error('Invalid root configuration');
    }
  };

  const createSlice: CreateSlice = (slice) => {
    if (configured) {
      throw new Error('createSlice no longer available');
    }
    if (sliceIdMap.has(slice.id)) {
      throw new Error(`Duplicated slice id: ${slice.id}`);
    }
    sliceIdMap.set(slice.id, {
      component: slice.component,
      isStatic: slice.render === 'static',
    });
  };

  let ready: Promise<AllPages | void> | undefined;
  const configure = async () => {
    if (!configured && !ready) {
      ready = fn({
        createPage,
        createLayout,
        createRoot,
        createApi,
        createSlice,
      });
      await ready;

      attachLayouts();
      configured = true;
    }
    await ready;
  };

  function attachLayouts() {
    for (const layout of unattachedLayouts.values()) {
      // TODO: check if `staticPaths` in child pages are consistent with layout's
      for (const [path, page] of pagePathMap) {
        if (
          layout.path === '/' ||
          layout.path === path ||
          path.startsWith(layout.path + '/')
        ) {
          page.layouts.push(layout);
        }
      }

      if (!layout.staticPaths) {
        continue;
      }

      const spec = parsePathWithSlug(layout.path);
      for (const staticPath of layout.staticPaths) {
        const mapping = getMappingFromStaticPath(spec, staticPath, true);
        const id = getLayoutSlotId(layout, mapping);

        layout.staticSlotIds.push(id);
        staticLayoutMap.set(id, layout);
      }
    }

    for (const page of pagePathMap.values()) {
      // ensure the order is correct, from the lowest to nearest layout
      page.layouts.sort((a, b) => a.path.length - b.path.length);
    }

    unattachedLayouts.clear();
  }

  const definedRouter = unstable_defineRouter({
    getConfig: async () => {
      await configure();
      const pathConfigs: Extract<RouterConfig, { type: 'route' | 'api' }>[] =
        [];
      const rootIsStatic = !rootItem || rootItem.render === 'static';

      function createPageConfig(
        path: string,
        page: PageInfo,
        staticPathSpec?: PathSpec,
      ): Extract<RouterConfig, { type: 'route' }> {
        const noSsr =
          noSsrSet.has(page.spec) ||
          (staticPathSpec !== undefined && noSsrSet.has(staticPathSpec));
        const elements: Record<string, { isStatic: boolean }> = {};
        // TODO: need to update slot ID for `getConfig()`?
        for (const layout of page.layouts) {
          elements[`layout:${layout.path}`] = {
            isStatic: !layout.isDynamic,
          };
        }

        elements[`page:${path}`] = { isStatic: !page.isDynamic };
        return {
          type: 'route',
          isStatic:
            rootIsStatic &&
            isAllElementsStatic(elements) &&
            isAllSlicesStatic(path),
          path: getGrouplessPathSpec(staticPathSpec ?? page.spec),
          rootElement: { isStatic: rootIsStatic },
          routeElement: { isStatic: true },
          elements,
          noSsr,
        };
      }

      for (const [path, { literalSpec, originalPath }] of staticPagePathMap) {
        pathConfigs.push(
          createPageConfig(path, pagePathMap.get(originalPath)!, literalSpec),
        );
      }

      for (const [path, page] of pagePathMap) {
        pathConfigs.push(createPageConfig(path, page));
      }

      for (const { render, pathSpec } of apiPathMap.values()) {
        pathConfigs.push({
          type: 'api',
          path: pathSpec,
          isStatic: render === 'static',
        });
      }

      // Sort routes by priority: "standard routes" -> api routes -> api wildcard routes -> standard wildcard routes
      const configs: RouterConfig[] = pathConfigs.sort((configA, configB) =>
        routePriorityComparator(configA, configB),
      );
      for (const [id, { isStatic }] of sliceIdMap) {
        configs.push({
          type: 'slice',
          id,
          isStatic,
        });
      }

      return configs;
    },
    handleRoute: async (path, { query }) => {
      await configure();

      // path without slugs
      const routePath = getPageRoutePath(path);
      if (!routePath) {
        throw new Error('Route not found: ' + path);
      }

      const page = pagePathMap.get(routePath);
      if (!page) {
        throw new Error('Page not found: ' + path);
      }

      const slots: ReactNode[] = [];
      const elements: Record<string, unknown> = {};

      // ensure path is encoded for props of page component
      const fullMapping = getPathMapping(
        getGrouplessPathSpec(page.spec),
        encodeURI(path),
      );
      const id = `page:${routePath}`;
      elements[id] = createElement(
        page.component,
        {
          ...fullMapping,
          ...(query ? { query } : {}),
          path,
        },
        createElement(Children),
      );
      slots.push(
        createElement(Slot, {
          id,
          key: id,
        }),
      );

      const layouts: {
        component: FunctionComponent<any>;
        props?: Record<string, unknown>;
      }[] = [];
      for (const layout of page.layouts) {
        const comp = layout.component;
        const id = getLayoutSlotId(layout, fullMapping);
        elements[id] = createElement(
          comp,
          trimMapping(layout.spec, fullMapping),
          createElement(Children),
        );
        layouts.push({
          component: Slot,
          props: { id },
        });
      }

      return {
        elements: elements,
        rootElement: createElement(
          rootItem ? rootItem.component : DefaultRoot,
          null,
          createElement(Children),
        ),
        routeElement: createNestedElements(
          layouts,
          createElement(Fragment, null, slots),
        ),
        slices: slicePathMap.get(routePath) || [],
      };
    },
    handleApi: async (req) => {
      await configure();
      const path = new URL(req.url).pathname;
      const method = req.method;
      const routePath = getApiRoutePath(path, method);
      if (!routePath) {
        throw new Error('API Route not found: ' + path);
      }
      const { handlers } = apiPathMap.get(routePath)!;
      const handler = handlers[method as Method] ?? handlers.all;
      if (!handler) {
        throw new Error(
          'API method not found: ' + method + 'for path: ' + path,
        );
      }
      return handler(req);
    },
    handleSlice: async (sliceId) => {
      await configure();
      const slice = sliceIdMap.get(sliceId);
      if (!slice) {
        throw new Error('Slice not found: ' + sliceId);
      }
      const { component } = slice;
      return { element: createElement(component) };
    },
  });

  return definedRouter as typeof definedRouter & {
    /** This for type inference of the router only. We do not actually return anything for this type. */
    DO_NOT_USE_pages: Exclude<
      Exclude<Awaited<Exclude<typeof ready, undefined>>, void>[number],
      void // createLayout returns void
    >;
  };
};

function countSlugsAndWildcards(pathSpec: PathSpec) {
  let numSlugs = 0;
  let numWildcards = 0;
  for (const slug of pathSpec) {
    if (slug.type !== 'literal') {
      numSlugs++;
    }
    if (slug.type === 'wildcard') {
      numWildcards++;
    }
  }
  return { numSlugs, numWildcards };
}

function getMappingFromStaticPath(
  pathSpec: PathSpec,
  staticPath: string[],
  check = false,
): Record<string, string | string[]> {
  const mapping: Record<string, string | string[]> = {};
  let hasWildcard = false;
  let slugIndex = 0;
  for (const { type, name } of pathSpec) {
    switch (type) {
      case 'wildcard':
        mapping[name!] = staticPath.slice(slugIndex++);
        hasWildcard = true;
        break;
      case 'group':
        mapping[name!] = staticPath[slugIndex++]!;
        break;
    }
  }

  if (check && !hasWildcard && slugIndex !== staticPath.length) {
    throw new Error('staticPaths does not match with slug pattern');
  }

  return mapping;
}

function getLayoutSlotId(
  layout: LayoutInfo,
  mapping: Record<string, string | string[]> | null,
) {
  const paths: string[] = [];
  for (const item of layout.spec) {
    if (item.type === 'literal') {
      paths.push(item.name);
      continue;
    }

    if (!mapping) {
      continue;
    }

    const value = mapping[item.name!];
    if (Array.isArray(value)) {
      paths.push(`${item.name}=${value.join(',')}`);
    } else {
      paths.push(`${item.name}=${value ?? ''}`);
    }
  }

  return 'layout:/' + paths.join('/');
}

/**
 * trim mapping to only allow the properties referenced in the given path
 */
function trimMapping(
  pathSpec: PathSpec,
  mapping: Record<string, string | string[]> | null,
) {
  const trimmed: Record<string, string | string[]> = {};

  for (const seg of pathSpec) {
    if (seg.type !== 'literal' && seg.name && mapping) {
      const res = mapping[seg.name];
      if (!res) {
        continue;
      }

      trimmed[seg.name] = res;
    }
  }

  return trimmed;
}

export function getGrouplessPathSpec(pathSpec: PathSpec) {
  return pathSpec.filter(
    (part) => !(part.type === 'literal' && part.name.startsWith('(')),
  );
}
