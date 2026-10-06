import type { Unstable_ElementSource as ElementSource } from 'waku/minimal/server';
import type { unstable_defineRouter } from 'waku/router/server';
import { getPathMapping } from '../isomorphic-utils/path-spec.js';
import {
  getSliceSlotId,
  isSliceSlotId,
} from '../isomorphic-utils/route-path.js';
import type { ConfigRegistry } from './config-registry.js';
import type { RendererOption, RouteConfig } from './config.js';
import { getPathSpecCacheId } from './element-ids.js';

type Resolve = Parameters<typeof unstable_defineRouter>[0]['resolve'];
type Route = Extract<Awaited<ReturnType<Resolve>>, { elements: unknown }>;

export const createRouteResolver = (registry: ConfigRegistry) => {
  const resolveElement = async (
    id: string,
    preResolved?: NonNullable<ReturnType<ConfigRegistry['findSliceConfig']>>,
  ): Promise<ElementSource | null> => {
    if (!isSliceSlotId(id)) {
      return null;
    }
    const found =
      preResolved ?? registry.findSliceConfig(id.slice('slice:'.length));
    if (!found) {
      return null;
    }
    const { sliceConfig, params } = found;
    return {
      immutable: sliceConfig.isStatic,
      render: () => sliceConfig.renderer(params),
      ...(sliceConfig.getEtagFromParams && {
        getEtag: () => sliceConfig.getEtagFromParams!(params),
      }),
    };
  };

  const resolveRoute = async (
    config: RouteConfig,
    pathname: string,
    query: string,
  ): Promise<Route> => {
    const option: RendererOption = {
      routePath: pathname,
      query: config.isStatic ? undefined : query,
    };
    const bind = (spec: typeof config.rootElement): ElementSource => ({
      immutable: spec.isStatic,
      render: () => spec.renderer(option),
      ...(spec.getEtagFromOption && {
        getEtag: () => spec.getEtagFromOption!(option),
      }),
    });
    const elements: Route['elements'] = {
      root: bind(config.rootElement),
      route: {
        ...bind(config.routeElement),
        cacheKey: getPathSpecCacheId(config.path),
      },
      ...Object.fromEntries(
        Object.entries(config.elements).map(([id, spec]) => [id, bind(spec)]),
      ),
    };
    for (const id of config.slices || []) {
      const source = await resolveElement(getSliceSlotId(id));
      if (!source) {
        throw new Error('Slice not found: ' + id);
      }
      elements[getSliceSlotId(id)] = source;
    }
    return { elements, ...(config.noSsr && { noSsr: true }) };
  };
  const resolve: Resolve = async (pathname, query) => {
    const config = registry.findPathConfig(pathname);
    if (!config) {
      return null;
    }
    if (config.type === 'api') {
      const params = getPathMapping(config.path, pathname) ?? {};
      return (req) => config.handler(req, { params });
    }
    return resolveRoute(config, pathname, query);
  };
  return { resolve, resolveElement, resolveRoute };
};
