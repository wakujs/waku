import { Fragment, createElement } from 'react';
import type { FunctionComponent, ReactNode } from 'react';
import { getGrouplessPath } from '../lib/utils/create-pages.js';
import {
  getPathMapping,
  joinPath,
  parseExactPath,
  parsePathWithSlug,
  pathSpecAsString,
} from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';
import { Children, Slot } from '../minimal/client.js';
import { ErrorBoundary } from '../router/client.js';
import type {
  AnyPage,
  GetSlugs,
  PropsForPages,
} from './create-pages-utils/inferred-path-types.js';
import { unstable_defineRouter } from './define-router.js';

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

export const pathMappingWithoutGroups: typeof getPathMapping = (
  pathSpec,
  pathname,
) => {
  const cleanPathSpec = pathSpec.filter(
    (spec) => !(spec.type === 'literal' && spec.name.startsWith('(')),
  );
  return getPathMapping(cleanPathSpec, pathname);
};

const sanitizeSlug = (slug: string) =>
  slug.replace(/\./g, '').replace(/ /g, '-');

// slug sanitization for API routes, which can keep preserve extension
// e.g. [slug].ts with slug="test.png"
const sanitizeSlugWithDot = (slug: string) => slug.replace(/ /g, '-');

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
        component: FunctionComponent<{ children: ReactNode }>;
      }
    | {
        render: 'static';
        path: Path;
        component: FunctionComponent<{ children: ReactNode }>;
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
        staticPaths?: string[] | undefined;
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

type ComponentList = {
  render: 'static' | 'dynamic';
  component: FunctionComponent<any>;
}[];

type ComponentEntry = FunctionComponent<any> | ComponentList;

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
  const staticPathMap = new Map<
    string,
    { literalSpec: PathSpec; originalSpec?: PathSpec }
  >();
  const dynamicPagePathMap = new Map<string, [PathSpec, ComponentEntry]>();
  const wildcardPagePathMap = new Map<string, [PathSpec, ComponentEntry]>();
  const dynamicLayoutPathMap = new Map<string, [PathSpec, ComponentEntry]>();
  const apiPathMap = new Map<
    string, // `${method} ${path}`
    {
      render: 'static' | 'dynamic';
      pathSpec: PathSpec;
      handlers: Partial<Record<Method | 'all', ApiHandler>>;
    }
  >();
  const staticComponentMap = new Map<string, FunctionComponent<any>>();
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
    if (staticComponentMap.has(joinPath(path, 'page').slice(1))) {
      return path;
    }
    const allPaths = [
      ...dynamicPagePathMap.keys(),
      ...wildcardPagePathMap.keys(),
    ];
    for (const p of allPaths) {
      if (pathMappingWithoutGroups(parsePathWithSlug(p), path)) {
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
        pathMappingWithoutGroups(parsePathWithSlug(p!), path)
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
    return (
      staticPathMap.has(path) ||
      dynamicPagePathMap.has(path) ||
      wildcardPagePathMap.has(path)
    );
  };

  /** helper to get original static slug path */
  const getOriginalStaticPathSpec = (path: string) => {
    const staticPathSpec = staticPathMap.get(path);
    if (staticPathSpec) {
      return staticPathSpec.originalSpec ?? staticPathSpec.literalSpec;
    }
  };

  const registerStaticComponent = (
    id: string,
    component: FunctionComponent<any>,
  ) => {
    if (
      staticComponentMap.has(id) &&
      staticComponentMap.get(id) !== component
    ) {
      throw new Error(`Duplicated component for: ${id}`);
    }
    staticComponentMap.set(id, component);
  };

  const isAllElementsStatic = (
    elements: Record<string, { isStatic?: boolean }>,
  ) => Object.values(elements).every((element) => element.isStatic);

  const isAllSlicesStatic = (path: string) =>
    (slicePathMap.get(path) || []).every(
      (sliceId) => sliceIdMap.get(sliceId)?.isStatic,
    );

  const createPage: CreatePage = (page) => {
    if (configured) {
      throw new Error('createPage no longer available');
    }
    if (pagePathExists(page.path)) {
      throw new Error(`Duplicated path: ${page.path}`);
    }

    const pathSpec = parsePathWithSlug(page.path);
    const { numSlugs, numWildcards } = getSlugsAndWildcards(pathSpec);
    if (page.unstable_disableSSR) {
      noSsrSet.add(pathSpec);
    }

    if (page.exactPath) {
      const spec = parseExactPath(page.path);
      if (page.render === 'static') {
        staticPathMap.set(page.path, {
          literalSpec: spec,
        });
        const id = joinPath(page.path, 'page').replace(/^\//, '');
        if (page.component) {
          registerStaticComponent(id, page.component);
        }
      } else if (page.component) {
        dynamicPagePathMap.set(page.path, [spec, page.component]);
      } else {
        dynamicPagePathMap.set(page.path, [spec, []]);
      }
    } else if (page.render === 'static' && numSlugs === 0) {
      const pagePath = getGrouplessPath(page.path);
      staticPathMap.set(pagePath, {
        literalSpec: pathSpec,
      });
      const id = joinPath(pagePath, 'page').replace(/^\//, '');
      if (pagePath !== page.path) {
        groupPathLookup.set(pagePath, page.path);
      }
      if (page.component) {
        registerStaticComponent(id, page.component);
      }
    } else if (
      page.render === 'static' &&
      numSlugs > 0 &&
      'staticPaths' in page
    ) {
      const staticPaths = page.staticPaths.map((item) =>
        (Array.isArray(item) ? item : [item]).map(sanitizeSlug),
      );
      for (const staticPath of staticPaths) {
        if (staticPath.length !== numSlugs && numWildcards === 0) {
          throw new Error('staticPaths does not match with slug pattern');
        }
        const mapping: Record<string, string | string[]> = {};
        let slugIndex = 0;
        const pathItems: string[] = [];
        pathSpec.forEach(({ type, name }) => {
          switch (type) {
            case 'literal':
              pathItems.push(name!);
              break;
            case 'wildcard':
              mapping[name!] = staticPath.slice(slugIndex);
              staticPath.slice(slugIndex++).forEach((slug) => {
                pathItems.push(slug);
              });
              break;
            case 'group':
              pathItems.push(staticPath[slugIndex++]!);
              mapping[name!] = pathItems[pathItems.length - 1]!;
              break;
          }
        });
        const definedPath = '/' + pathItems.join('/');
        const pagePath = getGrouplessPath(definedPath);
        staticPathMap.set(pagePath, {
          literalSpec: pathItems.map((name) => ({ type: 'literal', name })),
          originalSpec: pathSpec,
        });
        if (pagePath !== definedPath) {
          groupPathLookup.set(pagePath, definedPath);
        }
        const id = joinPath(pagePath, 'page').replace(/^\//, '');
        const WrappedComponent = (props: Record<string, unknown>) =>
          createElement(page.component as any, { ...props, ...mapping });
        registerStaticComponent(id, WrappedComponent);
      }
    } else if (page.render === 'dynamic' && numWildcards === 0) {
      const pagePath = getGrouplessPath(page.path);
      if (pagePath !== page.path) {
        groupPathLookup.set(pagePath, page.path);
      }
      dynamicPagePathMap.set(pagePath, [pathSpec, page.component]);
    } else if (page.render === 'dynamic' && numWildcards === 1) {
      const pagePath = getGrouplessPath(page.path);
      if (pagePath !== page.path) {
        groupPathLookup.set(pagePath, page.path);
      }
      wildcardPagePathMap.set(pagePath, [pathSpec, page.component]);
    } else {
      throw new Error('Invalid page configuration ' + JSON.stringify(page));
    }
    if (page.slices?.length) {
      slicePathMap.set(page.path, page.slices);
    }
    return page as Exclude<typeof page, { path: never } | { render: never }>;
  };

  const createLayout: CreateLayout = (layout) => {
    if (configured) {
      throw new Error('createLayout no longer available');
    }
    if (layout.render === 'static') {
      const id = joinPath(layout.path, 'layout').replace(/^\//, '');
      registerStaticComponent(id, layout.component);
    } else if (layout.render === 'dynamic') {
      if (dynamicLayoutPathMap.has(layout.path)) {
        throw new Error(`Duplicated dynamic path: ${layout.path}`);
      }
      const pathSpec = parsePathWithSlug(layout.path);
      dynamicLayoutPathMap.set(layout.path, [pathSpec, layout.component]);
    } else {
      throw new Error('Invalid layout configuration');
    }
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
      const { numSlugs, numWildcards } = getSlugsAndWildcards(pathSpec);
      if (numSlugs > 0 && options.staticPaths) {
        const staticPaths = (options.staticPaths as any).map((item: any) =>
          (Array.isArray(item) ? item : [item]).map(sanitizeSlugWithDot),
        );
        for (const staticPath of staticPaths) {
          if (staticPath.length !== numSlugs && numWildcards === 0) {
            throw new Error('staticPaths does not match with slug pattern');
          }
          let slugIndex = 0;
          const pathItems: string[] = [];
          pathSpec.forEach(({ type, name }) => {
            switch (type) {
              case 'literal':
                pathItems.push(name!);
                break;
              case 'wildcard':
                staticPath.slice(slugIndex++).forEach((slug: string) => {
                  pathItems.push(slug);
                });
                break;
              case 'group':
                pathItems.push(staticPath[slugIndex++]!);
                break;
            }
          });
          const definedPath = '/' + pathItems.join('/');
          const literalSpec = pathItems.map((name) => ({
            type: 'literal' as const,
            name,
          }));
          if (apiPathMap.has(definedPath)) {
            throw new Error(`Duplicated api path: ${definedPath}`);
          }
          apiPathMap.set(definedPath, {
            render: 'static',
            pathSpec: literalSpec,
            handlers: { GET: options.handler },
          });
        }
      } else {
        apiPathMap.set(options.path, {
          render: 'static',
          pathSpec,
          handlers: { GET: options.handler },
        });
      }
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

      configured = true;
    }
    await ready;
  };

  const getLayouts = (spec: PathSpec): string[] => {
    const pathSegments = spec.reduce<string[]>(
      (acc, _segment, index) => {
        acc.push(pathSpecAsString(spec.slice(0, index + 1)));
        return acc;
      },
      ['/'],
    );

    return pathSegments.filter(
      (segment) =>
        dynamicLayoutPathMap.has(segment) ||
        staticComponentMap.has(joinPath(segment, 'layout').slice(1)), // feels like a hack
    );
  };

  const definedRouter = unstable_defineRouter({
    getConfig: async () => {
      await configure();
      const routeConfigs: {
        type: 'route';
        path: PathSpec;
        isStatic: boolean;
        pathPattern?: PathSpec;
        rootElement: { isStatic?: boolean };
        routeElement: { isStatic?: boolean };
        elements: Record<string, { isStatic?: boolean }>;
        noSsr: boolean;
      }[] = [];
      const rootIsStatic = !rootItem || rootItem.render === 'static';
      for (const [path, { literalSpec, originalSpec }] of staticPathMap) {
        const noSsr = noSsrSet.has(literalSpec);

        const layoutPaths = getLayouts(originalSpec ?? literalSpec);

        const elements = {
          ...layoutPaths.reduce<Record<string, { isStatic: boolean }>>(
            (acc, lPath) => {
              acc[`layout:${lPath}`] = {
                isStatic: !dynamicLayoutPathMap.has(lPath),
              };
              return acc;
            },
            {},
          ),
          [`page:${path}`]: { isStatic: staticPathMap.has(path) },
        };

        routeConfigs.push({
          type: 'route',
          path: literalSpec.filter((part) => !part.name?.startsWith('(')),
          isStatic:
            rootIsStatic &&
            isAllElementsStatic(elements) &&
            isAllSlicesStatic(path),
          ...(originalSpec && { pathPattern: originalSpec }),
          rootElement: { isStatic: rootIsStatic },
          routeElement: { isStatic: true },
          elements,
          noSsr,
        });
      }
      for (const [path, [pathSpec, components]] of dynamicPagePathMap) {
        const noSsr = noSsrSet.has(pathSpec);
        const layoutPaths = getLayouts(pathSpec);
        const elements = {
          ...layoutPaths.reduce<Record<string, { isStatic: boolean }>>(
            (acc, lPath) => {
              acc[`layout:${lPath}`] = {
                isStatic: !dynamicLayoutPathMap.has(lPath),
              };
              return acc;
            },
            {},
          ),
        };
        if (Array.isArray(components)) {
          for (let i = 0; i < components.length; i++) {
            const component = components[i];
            if (component) {
              elements[`page:${path}:${i}`] = {
                isStatic: component.render === 'static',
              };
            }
          }
        } else {
          elements[`page:${path}`] = { isStatic: false };
        }
        routeConfigs.push({
          type: 'route',
          isStatic:
            rootIsStatic &&
            isAllElementsStatic(elements) &&
            isAllSlicesStatic(path),
          path: pathSpec.filter((part) => !part.name?.startsWith('(')),
          rootElement: { isStatic: rootIsStatic },
          routeElement: { isStatic: true },
          elements,
          noSsr,
        });
      }
      for (const [path, [pathSpec, components]] of wildcardPagePathMap) {
        const noSsr = noSsrSet.has(pathSpec);
        const layoutPaths = getLayouts(pathSpec);
        const elements = {
          ...layoutPaths.reduce<Record<string, { isStatic: boolean }>>(
            (acc, lPath) => {
              acc[`layout:${lPath}`] = {
                isStatic: !dynamicLayoutPathMap.has(lPath),
              };
              return acc;
            },
            {},
          ),
        };
        if (Array.isArray(components)) {
          for (let i = 0; i < components.length; i++) {
            const component = components[i];
            if (component) {
              elements[`page:${path}:${i}`] = {
                isStatic: component.render === 'static',
              };
            }
          }
        } else {
          elements[`page:${path}`] = { isStatic: false };
        }
        routeConfigs.push({
          type: 'route',
          isStatic:
            rootIsStatic &&
            isAllElementsStatic(elements) &&
            isAllSlicesStatic(path),
          path: pathSpec.filter((part) => !part.name?.startsWith('(')),
          rootElement: { isStatic: rootIsStatic },
          routeElement: { isStatic: true },
          elements,
          noSsr,
        });
      }
      const apiConfigs = Array.from(apiPathMap.values()).map(
        ({ pathSpec, render }) => {
          return {
            type: 'api' as const,
            path: pathSpec,
            isStatic: render === 'static',
          };
        },
      );

      const sliceConfigs = Array.from(sliceIdMap).map(([id, { isStatic }]) => ({
        type: 'slice' as const,
        id,
        isStatic,
      }));

      const pathConfigs = [...routeConfigs, ...apiConfigs]
        // Sort routes by priority: "standard routes" -> api routes -> api wildcard routes -> standard wildcard routes
        .sort((configA, configB) => routePriorityComparator(configA, configB));
      return [...pathConfigs, ...sliceConfigs];
    },
    handleRoute: async (path, { query }) => {
      await configure();

      // path without slugs
      const routePath = getPageRoutePath(path);
      if (!routePath) {
        throw new Error('Route not found: ' + path);
      }

      let pageComponent =
        staticComponentMap.get(joinPath(routePath, 'page').slice(1)) ??
        dynamicPagePathMap.get(routePath)?.[1] ??
        wildcardPagePathMap.get(routePath)?.[1];
      if (!pageComponent) {
        pageComponent = [];
        for (const [name, v] of staticComponentMap.entries()) {
          if (name.startsWith(joinPath(routePath, 'page').slice(1))) {
            pageComponent.push({
              component: v,
              render: 'static',
            });
          }
        }
      }
      if (!pageComponent) {
        throw new Error('Page not found: ' + path);
      }
      const layoutMatchPath = groupPathLookup.get(routePath) ?? routePath;
      const pathSpec = parsePathWithSlug(layoutMatchPath);
      const mapping = pathMappingWithoutGroups(
        pathSpec,
        // ensure path is encoded for props of page component
        encodeURI(path),
      );
      const result: Record<string, unknown> = {};
      if (Array.isArray(pageComponent)) {
        for (let i = 0; i < pageComponent.length; i++) {
          const comp = pageComponent[i];
          if (!comp) {
            continue;
          }
          result[`page:${routePath}:${i}`] = createElement(comp.component, {
            ...mapping,
            ...(query ? { query } : {}),
            path,
          });
        }
      } else {
        result[`page:${routePath}`] = createElement(
          pageComponent,
          { ...mapping, ...(query ? { query } : {}), path },
          createElement(Children),
        );
      }

      const layoutPaths = getLayouts(
        getOriginalStaticPathSpec(path) ?? pathSpec,
      );

      for (const segment of layoutPaths) {
        const layout =
          dynamicLayoutPathMap.get(segment)?.[1] ??
          staticComponentMap.get(joinPath(segment, 'layout').slice(1)); // feels like a hack

        if (layout && !Array.isArray(layout)) {
          const id = 'layout:' + segment;
          result[id] = createElement(layout, null, createElement(Children));
        } else {
          throw new Error('Invalid layout ' + segment);
        }
      }
      // loop over all layouts for path
      const layouts = layoutPaths.map((lPath) => ({
        component: Slot,
        props: { id: `layout:${lPath}` },
      }));
      const finalPageChildren = Array.isArray(pageComponent)
        ? createElement(
            Fragment,
            null,
            pageComponent.map((_comp, order) =>
              createElement(Slot, {
                id: `page:${routePath}:${order}`,
                key: `page:${routePath}:${order}`,
              }),
            ),
          )
        : createElement(Slot, { id: `page:${routePath}` });

      return {
        elements: result,
        rootElement: createElement(
          rootItem ? rootItem.component : DefaultRoot,
          null,
          createElement(Children),
        ),
        routeElement: createNestedElements(layouts, finalPageChildren),
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

const getSlugsAndWildcards = (pathSpec: PathSpec) => {
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
};
