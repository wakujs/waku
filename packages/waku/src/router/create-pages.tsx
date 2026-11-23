import { createElement } from 'react';
import type { FunctionComponent, ReactElement, ReactNode } from 'react';
import {
  Children_UNSTABLE as Children,
  Slot_UNSTABLE as Slot,
} from 'waku/minimal/client';
import { ErrorBoundary } from '../router/client.js';
import type {
  ApiHandler,
  HandlerInterceptor,
  RuntimeConfig,
} from './create-pages-utils/config.js';
import type {
  AnyPage,
  GetSlugs,
  PropsForPages,
  RouteParams,
  SharedLayoutParams,
} from './create-pages-utils/inferred-path-types.js';
import {
  countSlugsAndWildcards,
  parseExactPath,
} from './create-pages-utils/path-spec.js';
import { createConfiguredRouter } from './create-pages-utils/router.js';
import {
  getPathMapping,
  parsePathWithSlug,
  pathSpecAsString,
} from './isomorphic-utils/path-spec.js';
import type { PathSpec } from './isomorphic-utils/path-spec.js';
import {
  getGrouplessPath,
  pathnameToRoutePath,
} from './isomorphic-utils/route-path.js';
import type { SearchCodec } from './isomorphic-utils/search-codec.js';

type Method =
  | 'GET'
  | 'HEAD'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'CONNECT'
  | 'OPTIONS'
  | 'TRACE'
  | 'PATCH'
  | 'QUERY';

const allowedMethods = (handlers: Partial<Record<Method | 'all', unknown>>) =>
  Object.keys(handlers).filter(
    (method) => method !== 'all' && handlers[method as Method],
  );

const getPathMappingWithoutGroups: typeof getPathMapping = (
  pathSpec,
  pathname,
) => {
  const cleanPathSpec = pathSpec.filter(
    (spec) => !(spec.type === 'literal' && spec.name.startsWith('(')),
  );
  return getPathMapping(cleanPathSpec, pathname);
};
export const getPathMappingWithoutGroupsForTest = getPathMappingWithoutGroups;

const sanitizeSlug = (slug: string) => slug.replace(/ /g, '-');

const normalizeStaticPaths = (
  staticPaths: readonly (string | readonly string[])[],
): string[][] =>
  staticPaths.map((item) =>
    (Array.isArray(item) ? item : [item]).map(sanitizeSlug),
  );

const assertStaticPathArity = (
  staticSegments: readonly string[],
  slugCount: number,
  wildcardCount: number,
) => {
  if (staticSegments.length !== slugCount && wildcardCount === 0) {
    throw new Error('staticPaths does not match with slug pattern');
  }
};

const assertUniqueParamNames = (pathSpec: PathSpec, path: string) => {
  const names = pathSpec.flatMap((item) =>
    item.type === 'literal' ? [] : [item.name],
  );
  if (new Set(names).size !== names.length) {
    throw new Error(`Duplicated param name in path: ${path}`);
  }
};

const eraseParamNames = (pathSpec: PathSpec) =>
  JSON.stringify(
    pathSpec.map((item) =>
      item.type === 'literal' ? item : { ...item, name: '' },
    ),
  );

const getPageSlotId = (pathKey: string) => `page:${pathKey}`;
type RouteParamValues = Record<string, string | string[]>;

const getLayoutSlotId = (layoutPath: string, params: RouteParamValues) =>
  'layout:/' +
  parsePathWithSlug(layoutPath)
    .map((item) => {
      if (item.type === 'literal') {
        return item.name.replace(/[%[\]]/g, (char) => encodeURIComponent(char));
      }
      const name = encodeURIComponent(item.name!);
      const value = Object.hasOwn(params, item.name!)
        ? params[item.name!]
        : undefined;
      const known =
        value === undefined
          ? ''
          : '=' + [value].flat().map(encodeURIComponent).join('/');
      return item.type === 'wildcard'
        ? `[...${name}${known}]`
        : `${item.prefix ?? ''}[${name}${known}]${item.suffix ?? ''}`;
    })
    .join('/');

const parseSearchOrThrow = (
  codec: SearchCodec<any>,
  query: string,
): Record<string, unknown> => {
  try {
    return codec.parse(query);
  } catch (cause) {
    throw Object.assign(new Response('Bad Request', { status: 400 }), {
      cause,
    });
  }
};

const forEachConcreteStaticPath = (
  pathSpec: PathSpec,
  staticPathsInput: readonly (string | readonly string[])[],
  fn: (concrete: ReturnType<typeof expandStaticRoutePath>) => void,
) => {
  const { numSlugs, numWildcards } = countSlugsAndWildcards(pathSpec);
  for (const staticSegments of normalizeStaticPaths(staticPathsInput)) {
    assertStaticPathArity(staticSegments, numSlugs, numWildcards);
    fn(expandStaticRoutePath(pathSpec, staticSegments));
  }
};

type IsValidPathItem<T> = T extends `/${string}` | '[]' | '' ? false : true;
type IsValidPathInSlugPath<T> = T extends `/${infer L}/${infer R}`
  ? IsValidPathItem<L> extends true
    ? IsValidPathInSlugPath<`/${R}`>
    : false
  : T extends `/${infer U}`
    ? IsValidPathItem<U>
    : false;
export type IsValidPathInSlugPathForTest<T> = IsValidPathInSlugPath<T>;
type HasSlugInPath<
  T,
  K extends string,
> = T extends `/${string}[${K}]${string}/${infer _Rest}`
  ? true
  : T extends `/${infer _}/${infer U}`
    ? HasSlugInPath<`/${U}`, K>
    : T extends `/${string}[${K}]${string}`
      ? true
      : false;
export type HasSlugInPathForTest<T, K extends string> = HasSlugInPath<T, K>;

type HasWildcardInPath<T> = T extends `/[...${string}]/${string}`
  ? true
  : T extends `/${infer _}/${infer U}`
    ? HasWildcardInPath<`/${U}`>
    : T extends `/[...${string}]`
      ? true
      : false;
export type HasWildcardInPathForTest<T> = HasWildcardInPath<T>;

type PathWithSlug<T, K extends string> =
  IsValidPathInSlugPath<T> extends true
    ? HasSlugInPath<T, K> extends true
      ? T
      : never
    : never;
export type PathWithSlugForTest<T, K extends string> = PathWithSlug<T, K>;

type StaticSlugRoutePathsTuple<
  T extends string,
  Slugs extends unknown[] = GetSlugs<T>,
  Result extends readonly string[] = [],
> = Slugs extends []
  ? Result
  : Slugs extends [infer _, ...infer Rest]
    ? StaticSlugRoutePathsTuple<T, Rest, readonly [...Result, string]>
    : never;
export type StaticSlugRoutePathsTupleForTest<
  T extends string,
  Slugs extends unknown[] = GetSlugs<T>,
  Result extends readonly string[] = [],
> = StaticSlugRoutePathsTuple<T, Slugs, Result>;

type StaticSlugRoutePaths<T extends string> =
  HasWildcardInPath<T> extends true
    ? readonly string[] | readonly string[][]
    : StaticSlugRoutePathsTuple<T> extends readonly [string]
      ? readonly string[]
      : StaticSlugRoutePathsTuple<T>[];

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

type PathWithWildcard<
  Path,
  SlugKey extends string,
  WildSlugKey extends string,
> = PathWithSlug<Path, SlugKey | `...${WildSlugKey}`>;
export type PathWithWildcardForTest<
  Path,
  SlugKey extends string,
  WildSlugKey extends string,
> = PathWithWildcard<Path, SlugKey, WildSlugKey>;

/**
 * Returns a `dynamic` slot's element tag (etag). While the tag is unchanged the
 * client reuses its cached element instead of receiving it again. Only consulted
 * for dynamic slots.
 *
 * - Opaque to Waku; compared with `===`.
 * - Must change whenever the rendered content would.
 * - Keep it a short ASCII string (a hash or version): the client echoes its
 *   tags in a header. A non-header-safe or empty value is treated as no tag.
 * - Return `undefined` for no tag: the element is always sent, overriding the
 *   client's cache for the slot.
 */
type GetEtag<Props> = (props: Props) => Promise<string | undefined>;

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
    | {
        component: null; // For build-time pruning
      }
  ) & {
    unstable_noSsr?: boolean;
    /**
     * If true, the path will be matched exactly, without wildcards or slugs.
     * File-based pages set it in `getConfig`.
     */
    exactPath?: ExactPath;
    /**
     * List of slice ids used in the component.
     * This is _required_ to send the slices along with the component.
     */
    slices?: Slices;
    /**
     * Source file path of the page module, relative to `<rootDir>/<srcDir>`
     * (e.g. `pages/foo.tsx`). When set, the framework can prune the module's
     * chunks from the runtime server bundle if the route is fully static.
     */
    unstable_sourceFile?: string | undefined;
    /**
     * Per-render element tag (etag) for a `dynamic` page. Ignored for `static`
     * pages.
     */
    unstable_getEtag?: GetEtag<PropsForPages<Path>>;
    /**
     * Bring-your-own search-params codec for this route. The server parses the
     * `query` with it (rejecting a malformed query as 400 and injecting a typed
     * `search` prop). Share the codec with a local href factory or search hooks.
     * The page's `search` type is declared via `SearchCodecsConfig` or generated
     * by fs-router typegen.
     */
    unstable_searchCodec?: SearchCodec<any>;
  },
) => Omit<
  Extract<
    Exclude<typeof page, { path: never } | { render: never }>,
    { render: 'static' | 'dynamic' }
  >,
  'unstable_noSsr'
>;

export type CreateLayout = <
  Path extends string,
  StaticPaths extends StaticSlugRoutePaths<Path> | undefined = undefined,
>(
  layout: (
    | {
        render: 'dynamic';
        path: Path;
        component: FunctionComponent<
          { children: ReactNode } & RouteParams<Path>
        >;
        unstable_sourceFile?: string | undefined;
      }
    | {
        render: 'static';
        path: Path;
        component: FunctionComponent<
          { children: ReactNode } & (StaticPaths extends undefined
            ? SharedLayoutParams<Path>
            : RouteParams<Path>)
        >;
        /**
         * The param values to prerender the layout with. Dynamic pages below
         * it answer only these values; other values are not found. Without
         * it, dynamic pages share one render with unknown params `undefined`.
         */
        staticPaths?: StaticPaths;
        unstable_sourceFile?: string | undefined;
      }
    | {
        component: null; // For build-time pruning
      }
  ) & {
    /**
     * Per-render element tag (etag) for a `dynamic` layout. Ignored for `static`
     * layouts.
     */
    unstable_getEtag?: GetEtag<RouteParams<Path>>;
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
        unstable_sourceFile?: string | undefined;
      }
    | {
        render: 'dynamic';
        path: Path;
        /**
         * Handlers by named method. Use `all` to handle all methods.
         * Named methods will take precedence over `all`.
         */
        handlers: Partial<Record<Method | 'all', ApiHandler>>;
        unstable_sourceFile?: string | undefined;
      }
    | {
        render: 'static';
        handler: null; // For build-time pruning
      }
    | {
        render: 'dynamic';
        handlers: null; // For build-time pruning
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
  slice: (
    | {
        render: 'dynamic';
        id: ID;
        component: FunctionComponent<
          { children: ReactNode } & SlugPropsFromId<ID>
        >;
        unstable_sourceFile?: string | undefined;
      }
    | {
        // Static slice without a slug in its id.
        render: 'static';
        id: PathWithoutSlug<`/${ID}`> extends never ? never : ID;
        component: FunctionComponent<{ children: ReactNode }>;
        unstable_sourceFile?: string | undefined;
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
        unstable_sourceFile?: string | undefined;
      }
    | {
        component: null; // For build-time pruning
      }
  ) & {
    /**
     * Per-render element tag (etag) for a `dynamic` slice. Ignored for `static`
     * slices.
     */
    unstable_getEtag?: GetEtag<SlugPropsFromId<ID>>;
  },
) => void;

type RootItem = {
  render: 'static' | 'dynamic';
  component: FunctionComponent<{ children: ReactNode }>;
  unstable_sourceFile?: string | undefined;
  /**
   * Per-render element tag (etag) for a `dynamic` root. Ignored for a `static`
   * root. The root takes no props, so the getter is parameterless.
   */
  unstable_getEtag?: () => Promise<string | undefined>;
};

export type CreateRoot = (
  root:
    | RootItem
    | {
        component: null; // For build-time pruning
      },
) => void;

export type CreateInterceptor = (interceptor: HandlerInterceptor) => void;

const DefaultRoot = ({ children }: { children: ReactNode }) => (
  <ErrorBoundary>
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
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

const compareRoutePriority = (
  a: {
    pathSpec: PathSpec;
    type: 'route' | 'api';
  },
  b: {
    pathSpec: PathSpec;
    type: 'route' | 'api';
  },
) => {
  const aPathSpec = a.pathSpec;
  const bPathSpec = b.pathSpec;
  const aPathLength = aPathSpec.length;
  const bPathLength = bPathSpec.length;
  const aHasWildcard = aPathSpec.at(-1)?.type === 'wildcard';
  const bHasWildcard = bPathSpec.at(-1)?.type === 'wildcard';

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
    const aIsLiteral = aPathSpec[i]?.type === 'literal';
    const bIsLiteral = bPathSpec[i]?.type === 'literal';
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

export function createPages<
  AllPages extends (AnyPage | ReturnType<CreateLayout>)[],
>(
  fn: (fns: {
    createPage: CreatePage;
    createLayout: CreateLayout;
    createRoot: CreateRoot;
    createApi: CreateApi;
    createSlice: CreateSlice;
    createInterceptor: CreateInterceptor;
  }) => Promise<AllPages>,
  options?: {
    unstable_skipBuild?: (routePath: string) => boolean;
  },
) {
  let configured = false;

  type PageEntry = {
    type: 'page';
    render: 'static' | 'dynamic';
    groupedPath: string;
    pathSpec: PathSpec;
    pathPatternSpec?: PathSpec;
    params?: RouteParamValues;
    component: FunctionComponent<any>;
    noSsr: boolean;
    slices: string[];
    sourceFile?: string | undefined;
    getEtag?: GetEtag<any> | undefined;
    searchCodec?: SearchCodec<any> | undefined;
  };
  type ApiEntry = {
    type: 'api';
    render: 'static' | 'dynamic';
    pathSpec: PathSpec;
    handlers: Partial<Record<Method | 'all', ApiHandler>>;
    staticParams?: Record<string, string | string[]>;
    sourceFile?: string | undefined;
  };
  // A path key is a declared pattern or a concrete path from staticPaths.
  const routeByPathKey = new Map<string, PageEntry | ApiEntry>();
  const kindByUnnamedPattern = new Map<string, 'static' | 'dynamic' | 'api'>();
  const addRoute = (
    pathKey: string,
    entry: PageEntry | ApiEntry,
    path: string,
  ) => {
    if (routeByPathKey.has(pathKey)) {
      throw new Error(
        `Duplicated ${entry.type === 'api' ? 'api ' : ''}path: ${path}`,
      );
    }
    routeByPathKey.set(pathKey, entry);
  };
  type LayoutEntry =
    | {
        render: 'static';
        component: FunctionComponent<any>;
        staticPaths?: readonly (string | readonly string[])[] | undefined;
        sourceFile?: string | undefined;
      }
    | {
        render: 'dynamic';
        component: FunctionComponent<any>;
        sourceFile?: string | undefined;
        getEtag?: GetEtag<any> | undefined;
      };
  const layoutByPath = new Map<string, LayoutEntry>();
  type SliceEntry<Props = any> = {
    component: FunctionComponent<{ children?: ReactNode } & Props>;
    isStatic: boolean;
    sourceFile?: string | undefined;
    getEtag?: GetEtag<Props> | undefined;
  };
  const sliceEntryById = new Map<string, SliceEntry>();
  let rootItem: RootItem | undefined = undefined;

  const createPathPropsMapper = (groupedPath: string) => {
    const pathSpec = parsePathWithSlug(groupedPath);
    return (pathname: string) =>
      getPathMappingWithoutGroups(pathSpec, pathname);
  };

  const createLayoutPropsMapper = (layoutPath: string) => {
    const pathSpec = parsePathWithSlug(layoutPath);
    const numSegments = pathSpec.filter(
      (segment) =>
        !(segment.type === 'literal' && segment.name.startsWith('(')),
    ).length;
    return (routePath: string) => {
      const layoutRoutePath =
        '/' +
        routePath.split('/').filter(Boolean).slice(0, numSegments).join('/');
      return getPathMappingWithoutGroups(pathSpec, layoutRoutePath) ?? {};
    };
  };

  const buildRouteElement = (
    layouts: { slotId: string }[],
    pathKey: string,
  ) => {
    const layoutElements = layouts.map(({ slotId }) => ({
      component: Slot,
      props: { id: slotId },
    }));
    return () =>
      createNestedElements(
        layoutElements,
        <Slot id={getPageSlotId(pathKey)} />,
      );
  };

  const renderRoot = () =>
    createElement(
      rootItem ? rootItem.component : DefaultRoot,
      null,
      <Children />,
    );

  const isAllElementsStatic = (
    elements: Record<string, { isStatic?: boolean }>,
  ) => Object.values(elements).every((element) => element.isStatic);

  const isAllSlicesStatic = (slices: string[]) =>
    slices.every((sliceId) => sliceEntryById.get(sliceId)?.isStatic);

  const createPage: CreatePage = (page) => {
    if (configured) {
      throw new Error('createPage no longer available');
    }
    if (!page.component) {
      return page as Extract<
        Exclude<typeof page, { path: never } | { render: never }>,
        { render: 'static' | 'dynamic' }
      >;
    }
    const pagePathPattern = pathnameToRoutePath(page.path);
    const pathKey = pathnameToRoutePath(getGrouplessPath(page.path));
    const unnamedPattern = eraseParamNames(
      page.exactPath ? parseExactPath(pathKey) : parsePathWithSlug(pathKey),
    );
    const kind = kindByUnnamedPattern.get(unnamedPattern);
    if (kind === 'api' || (kind === 'dynamic' && page.render === 'dynamic')) {
      throw new Error(`Duplicated path: ${page.path}`);
    }
    if (kind !== 'dynamic') {
      kindByUnnamedPattern.set(unnamedPattern, page.render);
    }
    const pathSpec = parsePathWithSlug(pagePathPattern);
    if (!page.exactPath) {
      assertUniqueParamNames(pathSpec, page.path);
    }
    const { numSlugs, numWildcards } = countSlugsAndWildcards(pathSpec);
    const searchCodec = page.unstable_searchCodec;
    if (searchCodec && page.render === 'static') {
      throw new Error(
        `unstable_searchCodec is not supported on a static route (${page.path}); search params need a per-request query, so use render: 'dynamic'.`,
      );
    }
    const pageEntry = {
      type: 'page' as const,
      render: page.render,
      groupedPath: pagePathPattern,
      pathSpec,
      component: page.component,
      noSsr: page.unstable_noSsr ?? false,
      slices: page.slices || [],
      sourceFile: page.unstable_sourceFile,
      getEtag: page.unstable_getEtag,
      searchCodec,
    };

    if (page.exactPath) {
      addRoute(
        pathKey,
        { ...pageEntry, pathSpec: parseExactPath(pagePathPattern) },
        page.path,
      );
    } else if (page.render === 'static' && numSlugs === 0) {
      addRoute(pathKey, pageEntry, page.path);
    } else if (
      page.render === 'static' &&
      numSlugs > 0 &&
      'staticPaths' in page
    ) {
      forEachConcreteStaticPath(
        pathSpec,
        page.staticPaths,
        ({ concretePath, pathItems, mapping }) => {
          addRoute(
            pathnameToRoutePath(getGrouplessPath(concretePath)),
            {
              ...pageEntry,
              groupedPath: pathnameToRoutePath(concretePath),
              pathSpec: pathItems.map((name) => ({ type: 'literal', name })),
              pathPatternSpec: pathSpec,
              params: mapping,
              component: (props: Record<string, unknown>) =>
                createElement(page.component as never, {
                  ...props,
                  ...mapping,
                }),
            },
            concretePath,
          );
        },
      );
    } else if (page.render === 'dynamic' && numWildcards <= 1) {
      addRoute(pathKey, pageEntry, page.path);
    } else {
      throw new Error('Invalid page configuration ' + JSON.stringify(page));
    }
    return page as Exclude<typeof page, { path: never } | { render: never }>;
  };

  const createLayout: CreateLayout = (layout) => {
    if (configured) {
      throw new Error('createLayout no longer available');
    }
    if (!layout.component) {
      return;
    }
    const pathPattern = pathnameToRoutePath(layout.path);
    assertUniqueParamNames(parsePathWithSlug(pathPattern), layout.path);
    if (layoutByPath.has(pathPattern)) {
      throw new Error(`Duplicated layout path: ${layout.path}`);
    }
    const sourceFile = layout.unstable_sourceFile;
    if (layout.render === 'static') {
      layoutByPath.set(pathPattern, {
        render: 'static',
        component: layout.component,
        staticPaths: layout.staticPaths,
        sourceFile,
      });
    } else if (layout.render === 'dynamic') {
      layoutByPath.set(pathPattern, {
        render: 'dynamic',
        component: layout.component,
        sourceFile,
        getEtag: layout.unstable_getEtag,
      });
    } else {
      throw new Error('Invalid layout configuration');
    }
  };

  const createApi: CreateApi = (options) => {
    if (configured) {
      throw new Error('createApi no longer available');
    }
    if (options.render === 'static') {
      if (!options.handler) {
        return;
      }
    } else {
      if (!options.handlers || !Object.values(options.handlers).some(Boolean)) {
        return;
      }
    }
    const apiPathPattern = pathnameToRoutePath(options.path);
    const pathSpec = parsePathWithSlug(apiPathPattern);
    const unnamedPattern = eraseParamNames(pathSpec);
    if (kindByUnnamedPattern.has(unnamedPattern)) {
      throw new Error(`Duplicated api path: ${options.path}`);
    }
    kindByUnnamedPattern.set(unnamedPattern, 'api');
    const sourceFile = options.unstable_sourceFile;
    assertUniqueParamNames(pathSpec, options.path);
    if (options.render === 'static') {
      const { numSlugs } = countSlugsAndWildcards(pathSpec);
      if (numSlugs > 0 && options.staticPaths) {
        forEachConcreteStaticPath(
          pathSpec,
          options.staticPaths,
          ({ concretePath, pathItems, mapping }) => {
            addRoute(
              pathnameToRoutePath(concretePath),
              {
                type: 'api',
                render: 'static',
                pathSpec: pathItems.map((name) => ({ type: 'literal', name })),
                handlers: { GET: options.handler },
                staticParams: mapping,
                sourceFile,
              },
              concretePath,
            );
          },
        );
      } else {
        addRoute(
          apiPathPattern,
          {
            type: 'api',
            render: 'static',
            pathSpec,
            handlers: { GET: options.handler },
            sourceFile,
          },
          options.path,
        );
      }
    } else {
      addRoute(
        apiPathPattern,
        {
          type: 'api',
          render: 'dynamic',
          pathSpec,
          handlers: options.handlers,
          sourceFile,
        },
        options.path,
      );
    }
  };

  const createRoot: CreateRoot = (root) => {
    if (configured) {
      throw new Error('createRoot no longer available');
    }
    if (!root.component) {
      return;
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
    if (!slice.component) {
      return;
    }
    const slicePathSpec = parsePathWithSlug(slice.id);
    assertUniqueParamNames(slicePathSpec, slice.id);
    const { numSlugs } = countSlugsAndWildcards(slicePathSpec);
    const sourceFile = slice.unstable_sourceFile;
    const getEtag = slice.unstable_getEtag;
    if (slice.render === 'static' && numSlugs > 0) {
      if (!('staticPaths' in slice) || !slice.staticPaths) {
        throw new Error(
          `Static slice with slug requires staticPaths: ${slice.id}`,
        );
      }
      forEachConcreteStaticPath(
        slicePathSpec,
        slice.staticPaths,
        ({ concretePath, mapping }) => {
          const concreteId = concretePath.replace(/^\//, '');
          if (sliceEntryById.has(concreteId)) {
            throw new Error(`Duplicated slice id: ${concreteId}`);
          }
          const WrappedComponent = (props: Record<string, unknown>) =>
            createElement(slice.component as never, { ...props, ...mapping });
          sliceEntryById.set(concreteId, {
            component: WrappedComponent,
            isStatic: true,
            sourceFile,
          });
        },
      );
      return;
    }
    if (sliceEntryById.has(slice.id)) {
      throw new Error(`Duplicated slice id: ${slice.id}`);
    }
    sliceEntryById.set(slice.id, {
      component: slice.component,
      isStatic: slice.render === 'static',
      sourceFile,
      getEtag,
    });
  };

  const interceptors: HandlerInterceptor[] = [];
  const createInterceptor: CreateInterceptor = (interceptor) => {
    if (configured) {
      throw new Error('createInterceptor no longer available');
    }
    interceptors.push(interceptor);
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
        createInterceptor,
      });
      await ready;

      configured = true;
    }
    await ready;
  };

  const getLayouts = (pathSpec: PathSpec): string[] => {
    const pathSegments = pathSpec.reduce<string[]>(
      (acc, _segment, index) => {
        acc.push(pathSpecAsString(pathSpec.slice(0, index + 1)));
        return acc;
      },
      ['/'],
    );

    return pathSegments.filter((segment) => layoutByPath.has(segment));
  };

  const definedRouter = createConfiguredRouter({
    getConfigs: async () => {
      await configure();
      type RendererOptions = { routePath: string; query: string | undefined };
      type ElementSpec = {
        isStatic: boolean;
        renderer: (options: RendererOptions) => ReactNode;
        sourceFile?: string;
        getEtagFromOptions?: (
          options: RendererOptions,
        ) => Promise<string | undefined>;
      };
      type LayoutMatch = {
        layoutPath: string;
        params: RouteParamValues;
        slotId: string;
      };
      const collectLayoutMatches = (
        spec: PathSpec,
        routeParams: RouteParamValues,
      ): LayoutMatch[] =>
        getLayouts(spec).map((layoutPath) => {
          const params = Object.fromEntries(
            parsePathWithSlug(layoutPath).flatMap((item) =>
              item.type !== 'literal' && Object.hasOwn(routeParams, item.name!)
                ? [[item.name!, routeParams[item.name!]!]]
                : [],
            ),
          );
          return {
            layoutPath,
            params,
            slotId: getLayoutSlotId(layoutPath, params),
          };
        });
      const expandByLayoutStaticPaths = (
        pathSpec: PathSpec,
      ): { pathSpec: PathSpec; params: RouteParamValues }[] => {
        let prefixes: { pathItems: string[]; params: RouteParamValues }[] = [
          { pathItems: [], params: {} },
        ];
        let prefixLength = 0;
        for (const layoutPath of getLayouts(pathSpec)) {
          const layout = layoutByPath.get(layoutPath);
          const staticPaths =
            layout?.render === 'static' ? layout.staticPaths : undefined;
          const layoutSpec = parsePathWithSlug(layoutPath);
          if (
            !staticPaths ||
            pathSpec
              .slice(0, layoutSpec.length)
              .every((item) => item.type === 'literal')
          ) {
            continue;
          }
          const nextPrefixes: typeof prefixes = [];
          forEachConcreteStaticPath(
            layoutSpec,
            staticPaths,
            ({ pathItems, mapping }) => {
              if (
                prefixes.some((prefix) =>
                  prefix.pathItems.every(
                    (item, index) => item === pathItems[index],
                  ),
                )
              ) {
                nextPrefixes.push({ pathItems, params: mapping });
              }
            },
          );
          prefixes = nextPrefixes;
          prefixLength = layoutSpec.length;
        }
        return prefixes.map(({ pathItems, params }) => ({
          pathSpec: [
            ...pathItems.map((name) => ({ type: 'literal' as const, name })),
            ...pathSpec.slice(prefixLength),
          ],
          params,
        }));
      };
      // Memoize so component and getEtag get the same props reference.
      const buildElementSpec = <Props,>(
        component: FunctionComponent<Props>,
        buildProps: (options: RendererOptions) => Props,
        isStatic: boolean,
        sourceFile: string | undefined,
        getEtag: GetEtag<Props> | undefined,
      ): ElementSpec => {
        const propsCache = new WeakMap<RendererOptions, Props>();
        const toProps = (options: RendererOptions): Props => {
          if (!propsCache.has(options)) {
            propsCache.set(options, buildProps(options));
          }
          return propsCache.get(options)!;
        };
        return {
          isStatic,
          renderer: (options) =>
            createElement(
              component as FunctionComponent<any>,
              toProps(options),
              <Children />,
            ),
          ...(sourceFile ? { sourceFile } : {}),
          ...(getEtag
            ? { getEtagFromOptions: (options) => getEtag(toProps(options)) }
            : {}),
        };
      };
      const buildLayoutElement = (
        layoutPath: string,
        params: RouteParamValues,
      ): ElementSpec => {
        const layout = layoutByPath.get(layoutPath)!;
        if (layout.render === 'dynamic') {
          const getLayoutPropsMapping = createLayoutPropsMapper(layoutPath);
          return buildElementSpec(
            layout.component,
            (options) => getLayoutPropsMapping(options.routePath),
            false,
            layout.sourceFile,
            layout.getEtag,
          );
        }
        const prunableSourceFile = layout.staticPaths
          ? undefined
          : layout.sourceFile;
        return buildElementSpec(
          layout.component,
          () => params,
          true,
          prunableSourceFile,
          undefined,
        );
      };
      const buildLayoutElements = (
        matches: LayoutMatch[],
      ): Record<string, ElementSpec> =>
        Object.fromEntries(
          matches.map(({ layoutPath, params, slotId }) => [
            slotId,
            buildLayoutElement(layoutPath, params),
          ]),
        );
      const buildPageElement = <Props,>(
        component: FunctionComponent<Props>,
        getPropsMapping: (routePath: string) => Record<string, unknown> | null,
        isStatic: boolean,
        sourceFile?: string,
        getEtag?: GetEtag<Props>,
        searchCodec?: SearchCodec<any>,
      ): ElementSpec =>
        buildElementSpec(
          component,
          (options) =>
            ({
              ...getPropsMapping(options.routePath),
              ...(options.query ? { query: options.query } : {}),
              ...(searchCodec
                ? {
                    search: parseSearchOrThrow(
                      searchCodec,
                      options.query ?? '',
                    ),
                  }
                : {}),
              path: options.routePath,
            }) as unknown as Props,
          isStatic,
          sourceFile,
          getEtag,
        );
      const rootIsStatic = !rootItem || rootItem.render === 'static';
      const rootSourceFile = rootItem?.unstable_sourceFile;
      const rootGetEtag = rootItem?.unstable_getEtag;
      const buildRootElement = (): ElementSpec => ({
        isStatic: rootIsStatic,
        renderer: renderRoot,
        ...(rootSourceFile ? { sourceFile: rootSourceFile } : {}),
        ...(rootGetEtag ? { getEtagFromOptions: () => rootGetEtag() } : {}),
      });
      const withoutGroups = (pathSpec: PathSpec) =>
        pathSpec.filter((part) => !part.name?.startsWith('('));
      const buildRouteConfigBase = (
        pathKey: string,
        { noSsr, slices }: PageEntry,
        pathSpec: PathSpec,
        layouts: LayoutMatch[],
        elements: Record<string, ElementSpec>,
      ) => ({
        type: 'route' as const,
        pathSpec: withoutGroups(pathSpec),
        isStatic:
          rootIsStatic &&
          isAllElementsStatic(elements) &&
          isAllSlicesStatic(slices),
        rootElement: buildRootElement(),
        routeElement: {
          isStatic: true,
          renderer: buildRouteElement(layouts, pathKey),
        },
        elements,
        noSsr,
        slices,
      });
      const pageEntries = Array.from(routeByPathKey).flatMap(
        ([pathKey, entry]) =>
          entry.type === 'page' ? [[pathKey, entry] as const] : [],
      );
      const buildStaticRouteConfigs = () =>
        pageEntries
          .filter(([, entry]) => entry.render === 'static')
          .map(([pathKey, entry]) => {
            const layouts = collectLayoutMatches(
              entry.pathPatternSpec ?? entry.pathSpec,
              entry.params ?? {},
            );
            const elements: Record<string, ElementSpec> =
              buildLayoutElements(layouts);
            elements[getPageSlotId(pathKey)] = buildPageElement(
              entry.component,
              createPathPropsMapper(entry.groupedPath),
              true,
              entry.sourceFile,
            );
            return {
              ...buildRouteConfigBase(
                pathKey,
                entry,
                entry.pathSpec,
                layouts,
                elements,
              ),
              ...(entry.pathPatternSpec && {
                pathPatternSpec: entry.pathPatternSpec,
              }),
            };
          });
      const buildDynamicLikeRouteConfigs = (
        pathKey: string,
        entry: PageEntry,
      ) => {
        const configs = expandByLayoutStaticPaths(entry.pathSpec).map(
          ({ pathSpec: expandedPathSpec, params }) => {
            const layouts = collectLayoutMatches(entry.pathSpec, params);
            const elements: Record<string, ElementSpec> =
              buildLayoutElements(layouts);
            elements[getPageSlotId(pathKey)] = buildPageElement(
              entry.component,
              createPathPropsMapper(entry.groupedPath),
              false,
              entry.sourceFile,
              entry.getEtag,
              entry.searchCodec,
            );
            return {
              ...buildRouteConfigBase(
                pathKey,
                entry,
                expandedPathSpec,
                layouts,
                elements,
              ),
              ...(entry.searchCodec ? { searchCodec: entry.searchCodec } : {}),
            };
          },
        );
        const priority = {
          type: 'route' as const,
          pathSpec: withoutGroups(entry.pathSpec),
        };
        return [priority, configs] as const;
      };
      const hasWildcard = (entry: PageEntry) =>
        entry.pathSpec.some((item) => item.type === 'wildcard');
      const buildDynamicRouteConfigs = () =>
        pageEntries
          .filter(
            ([, entry]) => entry.render === 'dynamic' && !hasWildcard(entry),
          )
          .map(([pathKey, entry]) =>
            buildDynamicLikeRouteConfigs(pathKey, entry),
          );
      const buildWildcardRouteConfigs = () =>
        pageEntries
          .filter(
            ([, entry]) => entry.render === 'dynamic' && hasWildcard(entry),
          )
          .map(([pathKey, entry]) =>
            buildDynamicLikeRouteConfigs(pathKey, entry),
          );
      const buildApiConfigs = () =>
        Array.from(routeByPathKey.values(), (entry) =>
          entry.type === 'api' ? [entry] : [],
        )
          .flat()
          .map(({ pathSpec, render, handlers, staticParams, sourceFile }) => ({
            type: 'api' as const,
            pathSpec,
            isStatic: render === 'static',
            handler: async (
              req: Request,
              apiContext: Parameters<ApiHandler>[1],
            ) => {
              const handler =
                (Object.hasOwn(handlers, req.method)
                  ? handlers[req.method as Method]
                  : undefined) ??
                (Object.hasOwn(handlers, 'all') ? handlers.all : undefined);
              if (!handler) {
                return new Response(null, {
                  status: 405,
                  headers: { allow: allowedMethods(handlers).join(', ') },
                });
              }
              return handler(
                req,
                staticParams ? { params: staticParams } : apiContext,
              );
            },
            ...(sourceFile ? { sourceFile } : {}),
          }));
      const buildSliceConfigs = () =>
        Array.from(
          sliceEntryById,
          ([id, { isStatic, sourceFile, getEtag }]) => {
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
              ...(sourceFile ? { sourceFile } : {}),
              ...(getEtag ? { getEtagFromParams: getEtag } : {}),
            };
          },
        );

      const pathConfigs = [
        ...buildStaticRouteConfigs().map(
          (config) => [config, [config]] as const,
        ),
        ...buildDynamicRouteConfigs(),
        ...buildWildcardRouteConfigs(),
        ...buildApiConfigs().map((config) => [config, [config]] as const),
      ]
        // Sort routes by priority: "standard routes" -> api routes -> api wildcard routes -> standard wildcard routes
        .sort(([priorityA], [priorityB]) =>
          compareRoutePriority(priorityA, priorityB),
        )
        .flatMap<RuntimeConfig>(([, configs]) => configs);
      return [...pathConfigs, ...buildSliceConfigs()];
    },
    ...(options?.unstable_skipBuild && {
      unstable_skipBuild: options.unstable_skipBuild,
    }),
    unstable_interceptors: interceptors,
  });

  return definedRouter as typeof definedRouter & {
    /** This for type inference of the router only. We do not actually return anything for this type. */
    DO_NOT_USE_pages: Exclude<
      Exclude<Awaited<Exclude<typeof ready, undefined>>, void>[number],
      void // createLayout returns void
    >;
  };
}

const expandStaticRoutePath = (
  pathSpec: PathSpec,
  staticSegments: readonly string[],
) => {
  const mapping: Record<string, string | string[]> = {};
  let slugIndex = 0;
  const pathItems: string[] = [];
  pathSpec.forEach((spec) => {
    switch (spec.type) {
      case 'literal':
        pathItems.push(spec.name!);
        break;
      case 'wildcard':
        mapping[spec.name!] = staticSegments.slice(slugIndex);
        staticSegments.slice(slugIndex++).forEach((slug) => {
          pathItems.push(slug);
        });
        break;
      case 'group': {
        const slug = staticSegments[slugIndex++]!;
        const prefix = spec.prefix ?? '';
        const suffix = spec.suffix ?? '';
        pathItems.push(`${prefix}${slug}${suffix}`);
        mapping[spec.name!] = slug;
        break;
      }
    }
  });
  const concretePath = '/' + pathItems.join('/');
  return {
    concretePath,
    pathItems,
    mapping,
  };
};
