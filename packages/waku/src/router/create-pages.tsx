import { createElement } from 'react';
import type { FunctionComponent, ReactElement, ReactNode } from 'react';
import { getGrouplessPath } from '../lib/utils/create-pages.js';
import {
  countSlugsAndWildcards,
  getPathMapping,
  joinPath,
  parseExactPath,
  parsePathWithSlug,
  pathSpecAsString,
} from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';
import { Children, Slot } from '../minimal/client.js';
import { ErrorBoundary } from '../router/client.js';
import { pathnameToRoutePath } from './common.js';
import type {
  AnyPage,
  GetSlugs,
  PropsForPages,
} from './create-pages-utils/inferred-path-types.js';
import { unstable_defineRouter } from './define-router.js';
import type { ApiHandler } from './define-router.js';

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

const sanitizeSlug = (slug: string) => slug.replace(/ /g, '-');

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
export type HasSlugInPath<
  T,
  K extends string,
> = T extends `/${string}[${K}]${string}/${infer _Rest}`
  ? true
  : T extends `/${infer _}/${infer U}`
    ? HasSlugInPath<`/${U}`, K>
    : T extends `/${string}[${K}]${string}`
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
          { children: ReactNode } & Omit<PropsForPages<Path>, 'path' | 'query'>
        >;
      }
    | {
        render: 'static';
        path: Path;
        component: FunctionComponent<
          { children: ReactNode } & Omit<PropsForPages<Path>, 'path' | 'query'>
        >;
      },
) => void;

export type CreateApi = <Path extends string>(
  params:
    | {
        render: 'static';
        path: Path;
        method: 'GET';
        handler: ApiHandler;
        staticPaths?: (string | string[])[] | undefined;
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

type SlugPropsFromId<ID extends string> =
  GetSlugs<`/${ID}`> extends never[]
    ? {}
    : GetSlugs<`/${ID}`> extends string[]
      ? { [K in GetSlugs<`/${ID}`>[number]]: string }
      : {};

export type CreateSlice = <
  ID extends string,
  StaticPaths extends StaticSlugRoutePaths<`/${ID}`>,
>(
  slice:
    | {
        render: 'dynamic';
        id: ID;
        component: FunctionComponent<
          { children: ReactNode } & SlugPropsFromId<ID>
        >;
      }
    | {
        // Static slice without a slug in its id.
        render: 'static';
        id: PathWithoutSlug<`/${ID}`> extends never ? never : ID;
        component: FunctionComponent<{ children: ReactNode }>;
      }
    | {
        // Static slice with a slug — staticPaths is required and
        // enumerates the concrete slug values to pre-build.
        render: 'static';
        id: PathWithStaticSlugs<`/${ID}`> extends never ? never : ID;
        component: FunctionComponent<
          { children: ReactNode } & SlugPropsFromId<ID>
        >;
        staticPaths: StaticPaths;
      },
) => void;

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
const DefaultRoot = ({ children }: { children: ReactNode }) => (
  <ErrorBoundary>
    <html>
      <head />
      <body>{children}</body>
    </html>
  </ErrorBoundary>
);

const createNestedElements = (
  elements: {
    component: FunctionComponent<any>;
    props?: Record<string, unknown>;
  }[],
  children: ReactElement,
): ReactElement =>
  elements.reduceRight(
    (result, element) =>
      createElement(element.component, element.props, result),
    children,
  );

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

  // Special case: root route (length 0) should come before wildcard routes
  // This ensures exact matches like "/" are checked before catch-all routes like "/[...notFound]"
  if (aPathLength === 0 && bHasWildcard) {
    return -1;
  }
  if (bPathLength === 0 && aHasWildcard) {
    return 1;
  }

  // Compare path lengths first (longer paths are more specific)
  if (aPathLength !== bPathLength) {
    return aPathLength > bPathLength ? -1 : 1;
  }

  // If path lengths are equal, literal segments take priority over dynamic segments
  const minLength = Math.min(aPathLength, bPathLength);
  for (let i = 0; i < minLength; i++) {
    const aIsLiteral = aPath[i]?.type === 'literal';
    const bIsLiteral = bPath[i]?.type === 'literal';
    if (aIsLiteral !== bIsLiteral) {
      return aIsLiteral ? -1 : 1;
    }
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
  options?: {
    unstable_skipBuild?: (routePath: string) => boolean;
  },
) => {
  let configured = false;

  // layout lookups retain (group) path and pathMaps store without group
  // paths are stored without groups to easily detect duplicates
  const groupedRoutePathByRoutePath = new Map<string, string>();
  const staticPageEntryByRoutePath = new Map<
    string,
    { literalSpec: PathSpec; originalSpec?: PathSpec; noSsr: boolean }
  >();
  type DynamicPageEntry = {
    pathSpec: PathSpec;
    component: FunctionComponent<any>;
    noSsr: boolean;
  };
  type LayoutEntry = {
    pathSpec: PathSpec;
    component: FunctionComponent<any>;
  };
  const dynamicPageEntryByRoutePath = new Map<string, DynamicPageEntry>();
  const wildcardPageEntryByRoutePath = new Map<string, DynamicPageEntry>();
  const dynamicLayoutEntryByRoutePath = new Map<string, LayoutEntry>();
  const apiEntryByRoutePath = new Map<
    string,
    {
      render: 'static' | 'dynamic';
      pathSpec: PathSpec;
      handlers: Partial<Record<Method | 'all', ApiHandler>>;
      staticParams?: Record<string, string | string[]>;
    }
  >();
  const staticComponentById = new Map<string, FunctionComponent<any>>();
  const getStaticLayout = (id: string) =>
    staticComponentById.get(joinPath(id, 'layout').slice(1));
  const getDynamicLayout = (segment: string) =>
    dynamicLayoutEntryByRoutePath.get(segment)?.component;
  const sliceIdsByRoutePath = new Map<string, string[]>();
  const sliceEntryById = new Map<
    string,
    {
      component: FunctionComponent<any>;
      isStatic: boolean;
    }
  >();
  let rootItem: RootItem | undefined = undefined;

  const pagePathExists = (path: string) =>
    apiEntryByRoutePath.has(path) ||
    staticPageEntryByRoutePath.has(path) ||
    dynamicPageEntryByRoutePath.has(path) ||
    wildcardPageEntryByRoutePath.has(path);

  /** Creates a function to map pathname to component props */
  const createPathPropsMapper = (path: string) => {
    const layoutMatchPath = groupedRoutePathByRoutePath.get(path) ?? path;
    const pathSpec = parsePathWithSlug(layoutMatchPath);
    return (pathname: string) => pathMappingWithoutGroups(pathSpec, pathname);
  };

  const createLayoutPropsMapper = (layoutPath: string) => {
    const pathSpec = parsePathWithSlug(layoutPath);
    const numSegments = pathSpec.filter(
      (segment) =>
        !(segment.type === 'literal' && segment.name.startsWith('(')),
    ).length;
    return (routePath: string) => {
      const layoutRoutePath =
        numSegments === 0
          ? '/'
          : '/' +
            routePath
              .split('/')
              .filter(Boolean)
              .slice(0, numSegments)
              .join('/');
      return pathMappingWithoutGroups(pathSpec, layoutRoutePath) ?? {};
    };
  };

  const getLayoutIdPath = (layoutPath: string, routePath: string): string => {
    const numSegments = parsePathWithSlug(layoutPath).length;
    if (numSegments === 0) {
      return '/';
    }
    return (
      '/' + routePath.split('/').filter(Boolean).slice(0, numSegments).join('/')
    );
  };

  /** Builds the routeElement renderer from layouts and page slots */
  const buildRouteElement = (
    layouts: { layoutPath: string; layoutIdPath: string }[],
    path: string,
  ) => {
    const layoutElements = layouts.map(({ layoutIdPath }) => ({
      component: Slot,
      props: { id: `layout:${layoutIdPath}` },
    }));
    return () =>
      createNestedElements(layoutElements, <Slot id={`page:${path}`} />);
  };

  /** Renders the root component */
  const renderRoot = () =>
    createElement(
      rootItem ? rootItem.component : DefaultRoot,
      null,
      <Children />,
    );

  const registerStaticComponent = (
    id: string,
    component: FunctionComponent<any>,
  ) => {
    if (
      staticComponentById.has(id) &&
      staticComponentById.get(id) !== component
    ) {
      throw new Error(`Duplicated component for: ${id}`);
    }
    staticComponentById.set(id, component);
  };

  const isAllElementsStatic = (
    elements: Record<string, { isStatic?: boolean }>,
  ) => Object.values(elements).every((element) => element.isStatic);

  const isAllSlicesStatic = (path: string) =>
    (sliceIdsByRoutePath.get(path) || []).every(
      (sliceId) => sliceEntryById.get(sliceId)?.isStatic,
    );

  const createPage: CreatePage = (page) => {
    if (configured) {
      throw new Error('createPage no longer available');
    }
    const pageRoutePath = pathnameToRoutePath(page.path);
    if (pagePathExists(pageRoutePath)) {
      throw new Error(`Duplicated path: ${page.path}`);
    }

    const pathSpec = parsePathWithSlug(pageRoutePath);
    const { numSlugs, numWildcards } = countSlugsAndWildcards(pathSpec);

    const recordSlices = (routePath: string) => {
      if (page.slices?.length) {
        sliceIdsByRoutePath.set(routePath, page.slices);
      }
    };

    const noSsr = page.unstable_disableSSR ?? false;

    if (page.exactPath) {
      const routePath = pageRoutePath;
      const spec = parseExactPath(routePath);
      if (page.render === 'static') {
        staticPageEntryByRoutePath.set(routePath, { literalSpec: spec, noSsr });
        const id = joinPath(routePath, 'page').replace(/^\//, '');
        registerStaticComponent(id, page.component);
      } else {
        dynamicPageEntryByRoutePath.set(routePath, {
          pathSpec: spec,
          component: page.component,
          noSsr,
        });
      }
      recordSlices(routePath);
    } else if (page.render === 'static' && numSlugs === 0) {
      const routePath = pathnameToRoutePath(getGrouplessPath(page.path));
      staticPageEntryByRoutePath.set(routePath, {
        literalSpec: pathSpec,
        noSsr,
      });
      const id = joinPath(routePath, 'page').replace(/^\//, '');
      if (routePath !== pageRoutePath) {
        groupedRoutePathByRoutePath.set(routePath, pageRoutePath);
      }
      registerStaticComponent(id, page.component);
      recordSlices(routePath);
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
        const { definedPath, pathItems, mapping } = expandStaticPathSpec(
          pathSpec,
          staticPath,
        );
        const routePath = pathnameToRoutePath(getGrouplessPath(definedPath));
        const literalSpec: PathSpec = pathItems.map((name) => ({
          type: 'literal',
          name,
        }));
        staticPageEntryByRoutePath.set(routePath, {
          literalSpec,
          originalSpec: pathSpec,
          noSsr,
        });
        const definedRoutePath = pathnameToRoutePath(definedPath);
        if (routePath !== definedRoutePath) {
          groupedRoutePathByRoutePath.set(routePath, definedRoutePath);
        }
        const id = joinPath(routePath, 'page').replace(/^\//, '');
        const WrappedComponent = (props: Record<string, unknown>) =>
          createElement(page.component as any, { ...props, ...mapping });
        registerStaticComponent(id, WrappedComponent);
        recordSlices(routePath);
      }
    } else if (page.render === 'dynamic' && numWildcards === 0) {
      const routePath = pathnameToRoutePath(getGrouplessPath(page.path));
      if (routePath !== pageRoutePath) {
        groupedRoutePathByRoutePath.set(routePath, pageRoutePath);
      }
      dynamicPageEntryByRoutePath.set(routePath, {
        pathSpec,
        component: page.component,
        noSsr,
      });
      recordSlices(routePath);
    } else if (page.render === 'dynamic' && numWildcards === 1) {
      const routePath = pathnameToRoutePath(getGrouplessPath(page.path));
      if (routePath !== pageRoutePath) {
        groupedRoutePathByRoutePath.set(routePath, pageRoutePath);
      }
      wildcardPageEntryByRoutePath.set(routePath, {
        pathSpec,
        component: page.component,
        noSsr,
      });
      recordSlices(routePath);
    } else {
      throw new Error('Invalid page configuration ' + JSON.stringify(page));
    }
    return page as Exclude<typeof page, { path: never } | { render: never }>;
  };

  const createLayout: CreateLayout = (layout) => {
    if (configured) {
      throw new Error('createLayout no longer available');
    }
    const routePath = pathnameToRoutePath(layout.path);
    if (layout.render === 'static') {
      const id = joinPath(routePath, 'layout').replace(/^\//, '');
      registerStaticComponent(id, layout.component);
    } else if (layout.render === 'dynamic') {
      if (dynamicLayoutEntryByRoutePath.has(routePath)) {
        throw new Error(`Duplicated dynamic path: ${layout.path}`);
      }
      const pathSpec = parsePathWithSlug(routePath);
      dynamicLayoutEntryByRoutePath.set(routePath, {
        pathSpec,
        component: layout.component,
      });
    } else {
      throw new Error('Invalid layout configuration');
    }
  };

  const createApi: CreateApi = (options) => {
    if (configured) {
      throw new Error('createApi no longer available');
    }
    const routePath = pathnameToRoutePath(options.path);
    if (pagePathExists(routePath)) {
      throw new Error(`Duplicated api path: ${options.path}`);
    }
    const pathSpec = parsePathWithSlug(routePath);
    if (options.render === 'static') {
      const { numSlugs, numWildcards } = countSlugsAndWildcards(pathSpec);
      if (numSlugs > 0 && options.staticPaths) {
        const staticPaths = options.staticPaths.map((item) =>
          (Array.isArray(item) ? item : [item]).map(sanitizeSlug),
        );
        for (const staticPath of staticPaths) {
          if (staticPath.length !== numSlugs && numWildcards === 0) {
            throw new Error('staticPaths does not match with slug pattern');
          }
          const { definedPath, pathItems, mapping } = expandStaticPathSpec(
            pathSpec,
            staticPath,
          );
          const definedRoutePath = pathnameToRoutePath(definedPath);
          if (pagePathExists(definedRoutePath)) {
            throw new Error(`Duplicated api path: ${definedPath}`);
          }
          apiEntryByRoutePath.set(definedRoutePath, {
            render: 'static',
            pathSpec: pathItems.map((name) => ({ type: 'literal', name })),
            handlers: { GET: options.handler },
            staticParams: mapping,
          });
        }
      } else {
        apiEntryByRoutePath.set(routePath, {
          render: 'static',
          pathSpec,
          handlers: { GET: options.handler },
        });
      }
    } else {
      apiEntryByRoutePath.set(routePath, {
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
    const slicePathSpec = parsePathWithSlug(slice.id);
    const { numSlugs, numWildcards } = countSlugsAndWildcards(slicePathSpec);
    if (slice.render === 'static' && numSlugs > 0) {
      if (!('staticPaths' in slice) || !slice.staticPaths) {
        throw new Error(
          `Static slice with slug requires staticPaths: ${slice.id}`,
        );
      }
      const staticPaths = slice.staticPaths.map((item) =>
        (Array.isArray(item) ? item : [item]).map(sanitizeSlug),
      );
      for (const staticPath of staticPaths) {
        if (staticPath.length !== numSlugs && numWildcards === 0) {
          throw new Error('staticPaths does not match with slug pattern');
        }
        const { definedPath, mapping } = expandStaticPathSpec(
          slicePathSpec,
          staticPath,
        );
        const concreteId = definedPath.replace(/^\//, '');
        if (sliceEntryById.has(concreteId)) {
          throw new Error(`Duplicated slice id: ${concreteId}`);
        }
        const WrappedComponent = (props: Record<string, unknown>) =>
          createElement(slice.component as any, { ...props, ...mapping });
        sliceEntryById.set(concreteId, {
          component: WrappedComponent,
          isStatic: true,
        });
      }
      return;
    }
    if (sliceEntryById.has(slice.id)) {
      throw new Error(`Duplicated slice id: ${slice.id}`);
    }
    sliceEntryById.set(slice.id, {
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
        dynamicLayoutEntryByRoutePath.has(segment) || getStaticLayout(segment),
    );
  };

  const definedRouter = unstable_defineRouter({
    getConfigs: async () => {
      await configure();
      type ElementSpec = {
        isStatic: boolean;
        renderer: (options: {
          routePath: string;
          query: string | undefined;
        }) => ReactNode;
      };
      const routeConfigs: {
        type: 'route';
        path: PathSpec;
        isStatic: boolean;
        pathPattern?: PathSpec;
        rootElement: ElementSpec;
        routeElement: ElementSpec;
        elements: Record<string, ElementSpec>;
        noSsr: boolean;
        slices: string[];
      }[] = [];
      const rootIsStatic = !rootItem || rootItem.render === 'static';
      for (const [
        path,
        { literalSpec, originalSpec, noSsr },
      ] of staticPageEntryByRoutePath) {
        const routePath = groupedRoutePathByRoutePath.get(path) ?? path;
        const layouts = getLayouts(originalSpec ?? literalSpec).map(
          (layoutPath) => ({
            layoutPath,
            layoutIdPath: getLayoutIdPath(layoutPath, routePath),
          }),
        );
        const pageComponent = staticComponentById.get(
          joinPath(path, 'page').slice(1),
        )!;
        const getPropsMapping = createPathPropsMapper(path);

        const elements: Record<string, ElementSpec> = {};

        // Add layout elements
        for (const { layoutPath, layoutIdPath } of layouts) {
          const layout =
            getDynamicLayout(layoutPath) ?? getStaticLayout(layoutPath);
          if (!layout) {
            throw new Error('Invalid layout ' + layoutPath);
          }
          const getLayoutPropsMapping = createLayoutPropsMapper(layoutPath);
          elements[`layout:${layoutIdPath}`] = {
            isStatic: !dynamicLayoutEntryByRoutePath.has(layoutPath),
            renderer: (option) =>
              createElement(
                layout,
                getLayoutPropsMapping(option.routePath),
                <Children />,
              ),
          };
        }

        // Add page element
        elements[`page:${path}`] = {
          isStatic: true,
          renderer: (option) =>
            createElement(
              pageComponent,
              {
                ...getPropsMapping(option.routePath),
                ...(option.query ? { query: option.query } : {}),
                path: option.routePath,
              },
              <Children />,
            ),
        };

        routeConfigs.push({
          type: 'route',
          path: literalSpec.filter((part) => !part.name?.startsWith('(')),
          isStatic:
            rootIsStatic &&
            isAllElementsStatic(elements) &&
            isAllSlicesStatic(path),
          ...(originalSpec && { pathPattern: originalSpec }),
          rootElement: { isStatic: rootIsStatic, renderer: renderRoot },
          routeElement: {
            isStatic: true,
            renderer: buildRouteElement(layouts, path),
          },
          elements,
          noSsr,
          slices: sliceIdsByRoutePath.get(path) || [],
        });
      }
      for (const [
        path,
        { pathSpec, component, noSsr },
      ] of dynamicPageEntryByRoutePath) {
        const layouts = getLayouts(pathSpec).map((layoutPath) => ({
          layoutPath,
          layoutIdPath: layoutPath,
        }));
        const getPropsMapping = createPathPropsMapper(path);

        const elements: Record<string, ElementSpec> = {};

        // Add layout elements
        for (const { layoutPath, layoutIdPath } of layouts) {
          const layout =
            getDynamicLayout(layoutPath) ?? getStaticLayout(layoutPath);
          if (!layout) {
            throw new Error('Invalid layout ' + layoutPath);
          }
          const getLayoutPropsMapping = createLayoutPropsMapper(layoutPath);
          elements[`layout:${layoutIdPath}`] = {
            isStatic: !dynamicLayoutEntryByRoutePath.has(layoutPath),
            renderer: (option) =>
              createElement(
                layout,
                getLayoutPropsMapping(option.routePath),
                <Children />,
              ),
          };
        }

        // Add page element
        elements[`page:${path}`] = {
          isStatic: false,
          renderer: (option) =>
            createElement(
              component,
              {
                ...getPropsMapping(option.routePath),
                ...(option.query ? { query: option.query } : {}),
                path: option.routePath,
              },
              <Children />,
            ),
        };

        routeConfigs.push({
          type: 'route',
          isStatic:
            rootIsStatic &&
            isAllElementsStatic(elements) &&
            isAllSlicesStatic(path),
          path: pathSpec.filter((part) => !part.name?.startsWith('(')),
          rootElement: { isStatic: rootIsStatic, renderer: renderRoot },
          routeElement: {
            isStatic: true,
            renderer: buildRouteElement(layouts, path),
          },
          elements,
          noSsr,
          slices: sliceIdsByRoutePath.get(path) || [],
        });
      }
      for (const [
        path,
        { pathSpec, component, noSsr },
      ] of wildcardPageEntryByRoutePath) {
        const layouts = getLayouts(pathSpec).map((layoutPath) => ({
          layoutPath,
          layoutIdPath: layoutPath,
        }));
        const getPropsMapping = createPathPropsMapper(path);

        const elements: Record<string, ElementSpec> = {};

        // Add layout elements
        for (const { layoutPath, layoutIdPath } of layouts) {
          const layout =
            getDynamicLayout(layoutPath) ?? getStaticLayout(layoutPath);
          if (!layout) {
            throw new Error('Invalid layout ' + layoutPath);
          }
          const getLayoutPropsMapping = createLayoutPropsMapper(layoutPath);
          elements[`layout:${layoutIdPath}`] = {
            isStatic: !dynamicLayoutEntryByRoutePath.has(layoutPath),
            renderer: (option) =>
              createElement(
                layout,
                getLayoutPropsMapping(option.routePath),
                <Children />,
              ),
          };
        }

        // Add page element
        elements[`page:${path}`] = {
          isStatic: false,
          renderer: (option) =>
            createElement(
              component,
              {
                ...getPropsMapping(option.routePath),
                ...(option.query ? { query: option.query } : {}),
                path: option.routePath,
              },
              <Children />,
            ),
        };

        routeConfigs.push({
          type: 'route',
          isStatic:
            rootIsStatic &&
            isAllElementsStatic(elements) &&
            isAllSlicesStatic(path),
          path: pathSpec.filter((part) => !part.name?.startsWith('(')),
          rootElement: { isStatic: rootIsStatic, renderer: renderRoot },
          routeElement: {
            isStatic: true,
            renderer: buildRouteElement(layouts, path),
          },
          elements,
          noSsr,
          slices: sliceIdsByRoutePath.get(path) || [],
        });
      }
      const apiConfigs = Array.from(apiEntryByRoutePath.values()).map(
        ({ pathSpec, render, handlers, staticParams }) => {
          return {
            type: 'api' as const,
            path: pathSpec,
            isStatic: render === 'static',
            handler: async (
              req: Request,
              apiContext: Parameters<ApiHandler>[1],
            ) => {
              const path = new URL(req.url).pathname;
              const method = req.method;
              const handler = handlers[method as Method] ?? handlers.all;
              if (!handler) {
                throw new Error(
                  'API method not found: ' + method + 'for path: ' + path,
                );
              }
              return handler(
                req,
                staticParams ? { params: staticParams } : apiContext,
              );
            },
          };
        },
      );

      const sliceConfigs = Array.from(sliceEntryById).map(
        ([id, { isStatic }]) => {
          const slicePathSpec = parsePathWithSlug(id);
          const hasSlug = slicePathSpec.some((s) => s.type !== 'literal');
          return {
            type: 'slice' as const,
            id,
            ...(hasSlug ? { pathSpec: slicePathSpec } : {}),
            isStatic,
            renderer: async (params?: Record<string, string | string[]>) => {
              const slice = sliceEntryById.get(id);
              if (!slice) {
                throw new Error('Slice not found: ' + id);
              }
              return createElement(slice.component, params, <Children />);
            },
          };
        },
      );

      const pathConfigs = [...routeConfigs, ...apiConfigs]
        // Sort routes by priority: "standard routes" -> api routes -> api wildcard routes -> standard wildcard routes
        .sort((configA, configB) => routePriorityComparator(configA, configB));
      return [...pathConfigs, ...sliceConfigs];
    },
    ...(options?.unstable_skipBuild && {
      unstable_skipBuild: options.unstable_skipBuild,
    }),
  });

  return definedRouter as typeof definedRouter & {
    /** This for type inference of the router only. We do not actually return anything for this type. */
    DO_NOT_USE_pages: Exclude<
      Exclude<Awaited<Exclude<typeof ready, undefined>>, void>[number],
      void // createLayout returns void
    >;
  };
};

function expandStaticPathSpec(pathSpec: PathSpec, staticPath: string[]) {
  const mapping: Record<string, string | string[]> = {};
  let slugIndex = 0;
  const pathItems: string[] = [];
  pathSpec.forEach((spec) => {
    switch (spec.type) {
      case 'literal':
        pathItems.push(spec.name!);
        break;
      case 'wildcard':
        mapping[spec.name!] = staticPath.slice(slugIndex);
        staticPath.slice(slugIndex++).forEach((slug) => {
          pathItems.push(slug);
        });
        break;
      case 'group': {
        const slug = staticPath[slugIndex++]!;
        const prefix = spec.prefix ?? '';
        const suffix = spec.suffix ?? '';
        pathItems.push(`${prefix}${slug}${suffix}`);
        mapping[spec.name!] = slug;
        break;
      }
    }
  });
  const definedPath = '/' + pathItems.join('/');
  return {
    definedPath,
    pathItems,
    mapping,
  };
}
