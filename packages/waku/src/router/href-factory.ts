import type { RouteParams } from './create-pages-utils/inferred-path-types.js';
import {
  type ConstructedHref,
  buildRouteHref,
} from './isomorphic-utils/build-route-href.js';
import type { Unstable_SearchCodec } from './isomorphic-utils/search-codec.js';

type HrefTarget<Path extends string, Search> = {
  hash?: string;
} & ([Search] extends [never] ? { search?: never } : { search?: Search }) &
  (keyof RouteParams<Path> extends never
    ? { params?: never }
    : {
        params: {
          [
            Key in keyof RouteParams<Path>
          ]: RouteParams<Path>[Key] extends string[]
            ? readonly string[]
            : RouteParams<Path>[Key];
        };
      });

type HrefSegment<Segment extends string> =
  Segment extends `${string}[...${string}]${string}`
    ? string
    : Segment extends `${infer Prefix}[${string}]${infer Suffix}`
      ? `${Prefix}${string}${Suffix}`
      : Segment;

type HrefPath<
  Path extends string,
  Prefix extends string = '',
> = string extends Path
  ? string
  : Path extends `${infer Segment}/${infer Rest}`
    ? HrefPath<
        Rest,
        Segment extends '' | `(${string}`
          ? Prefix
          : Segment extends `${string}[...${string}]${string}`
            ? Prefix | `${Prefix}/${string}`
            : `${Prefix}/${HrefSegment<Segment>}`
      >
    : Path extends '' | `(${string}`
      ? Prefix extends ''
        ? '/'
        : Prefix
      : `${Prefix}/${HrefSegment<Path>}`;

type Href<Path extends string> =
  | HrefPath<Path>
  | `${HrefPath<Path>}?${string}`
  | `${HrefPath<Path>}#${string}`;

/** Builds href strings with locally inferred params and optional search. */
export type Unstable_RouteHrefFactory<
  Path extends string,
  Search extends Record<string, unknown> = never,
> = {
  (
    ...args: keyof RouteParams<Path> extends never
      ? [target?: HrefTarget<Path, Search>]
      : [target: HrefTarget<Path, Search>]
  ): Href<Path> & ConstructedHref<Path>;
  readonly path: Path;
} & ([Search] extends [never]
  ? { readonly searchCodec?: never }
  : { readonly searchCodec: Unstable_SearchCodec<Search> });

/**
 * Bind a route pattern and optional search codec. Calling the factory encodes
 * and checks params and serializes supplied search. Omitted search produces no
 * query and does not call the codec. Param and serializer errors throw before
 * navigation. Returned hrefs are primitive strings and can cross Server/Client
 * Component boundaries; they exclude the application's base.
 *
 * Outbound search validation belongs in `serialize`; the factory does not call
 * `parse`. The destination validates the incoming query and may reject it,
 * including an omitted query. Route-pattern types constrain factory hrefs at
 * navigation sites, not their params to static build paths. Concrete href types
 * constrain raw strings, not factory patterns. Routes without params allow an
 * omitted target.
 *
 * @example
 * const product = unstable_createRouteHref({ path: '/products/[id]', search: codec });
 * const href = product({ params: { id: '42' }, search: { page: 2 } });
 * // <Link to={href}>Product</Link>
 */
export function unstable_createRouteHref<
  const Path extends string,
  Search extends Record<string, unknown> = never,
>({
  path,
  search,
}: {
  path: Path;
  search?: Unstable_SearchCodec<Search>;
} & ([Search] extends [never]
  ? unknown
  : { search: Unstable_SearchCodec<Search> })): Unstable_RouteHrefFactory<
  Path,
  Search
> {
  const factory = Object.assign(
    (target?: HrefTarget<Path, Search>): Href<Path> => {
      const pathname = buildRouteHref(path, target?.params);
      let query = '';
      if (target?.search !== undefined) {
        if (!search) {
          throw new Error(
            `Cannot serialize search for "${path}": no search codec supplied`,
          );
        }
        query = search.serialize(target.search);
      }
      const hash = target?.hash?.replace(/^#/, '');
      const href =
        pathname + (query ? '?' + query : '') + (hash ? '#' + hash : '');
      return href as Href<Path>;
    },
    { path, searchCodec: search },
  );
  return factory as unknown as Unstable_RouteHrefFactory<Path, Search>;
}
