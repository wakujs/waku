import type { RouteParams } from './create-pages-utils/inferred-path-types.js';
import {
  type ConstructedHref,
  buildRouteHref,
} from './isomorphic-utils/build-route-href.js';
import type { SearchCodec } from './isomorphic-utils/search-codec.js';

type HrefParams<Path extends string, ExactPath> = ExactPath extends true
  ? { params?: never }
  : keyof RouteParams<Path> extends never
    ? { params?: never }
    : {
        params: {
          [
            Key in keyof RouteParams<Path>
          ]: RouteParams<Path>[Key] extends string[]
            ? readonly string[]
            : RouteParams<Path>[Key];
        };
      };

type HrefTarget<Path extends string, Search, ExactPath> = {
  hash?: string;
} & ([Search] extends [never] ? { search?: never } : { search?: Search }) &
  HrefParams<Path, ExactPath>;

type RouteHrefFactory<
  Path extends string,
  Search extends Record<string, unknown> = never,
  ExactPath extends boolean | undefined = undefined,
> = {
  (
    ...args: keyof RouteParams<Path, ExactPath> extends never
      ? [target?: HrefTarget<Path, Search, ExactPath>]
      : [target: HrefTarget<Path, Search, ExactPath>]
  ): ConstructedHref<Path>;
  readonly path: Path;
  readonly exactPath: ExactPath;
} & ([Search] extends [never]
  ? { readonly searchCodec?: never }
  : { readonly searchCodec: SearchCodec<Search> });

/**
 * Bind a route pattern and optional search codec. Calling the factory encodes
 * and checks params and serializes supplied search. Omitted search produces no
 * query and does not call the codec. Param and serializer errors throw before
 * navigation. Returned hrefs are primitive strings and can cross Server/Client
 * Component boundaries; they exclude the application's base.
 *
 * With `exactPath`, the path is used literally and takes no params.
 *
 * Outbound search validation belongs in `serialize`; the factory does not call
 * `parse`. The destination validates the incoming query and may reject it,
 * including an omitted query. Route-pattern types constrain factory hrefs at
 * navigation sites, not their params to static build paths. Results carry the
 * pattern's provenance, not a literal URL type. Concrete href types constrain
 * raw strings, not factory patterns. Routes without params allow an omitted
 * target.
 *
 * @example
 * import { unstable_createRouteHref as createRouteHref } from 'waku/router';
 * const product = createRouteHref({ path: '/products/[id]', search: codec });
 * const href = product({ params: { id: '42' }, search: { page: 2 } });
 * // <Link to={href}>Product</Link>
 */
export function createRouteHref<
  const Path extends string,
  Search extends Record<string, unknown> = never,
  ExactPath extends boolean | undefined = undefined,
>({
  path,
  search,
  exactPath,
}: {
  path: Path;
  search?: SearchCodec<Search>;
  exactPath?: ExactPath;
} & ([Search] extends [never]
  ? unknown
  : { search: SearchCodec<Search> })): RouteHrefFactory<
  Path,
  Search,
  ExactPath
> {
  const factory = Object.assign(
    (target?: HrefTarget<Path, Search, ExactPath>) => {
      const pathname = buildRouteHref(path, target?.params, { exactPath });
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
      return pathname + (query ? '?' + query : '') + (hash ? '#' + hash : '');
    },
    { path, searchCodec: search, exactPath },
  );
  return factory as unknown as RouteHrefFactory<Path, Search, ExactPath>;
}
