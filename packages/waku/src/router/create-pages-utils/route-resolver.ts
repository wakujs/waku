import type { Unstable_ElementSource as ElementSource } from 'waku/minimal/server';
import type { defineRouter } from '../define-router.js';
import { getPathMapping } from '../isomorphic-utils/path-spec.js';
import {
  getSliceSlotId,
  isSliceSlotId,
} from '../isomorphic-utils/router-protocol.js';
import type { ConfigRegistry } from './config-registry.js';
import type { RendererOptions, RouteConfig } from './config.js';
import { getPathSpecCacheId } from './element-ids.js';

type Resolve = Parameters<typeof defineRouter>[0]['resolve'];
type RouterDefinition = Extract<
  Awaited<ReturnType<Resolve>>,
  { elements: unknown }
>;

export function createRouteResolver(registry: ConfigRegistry) {
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
  ): Promise<RouterDefinition> => {
    const options: RendererOptions = {
      routePath: pathname,
      query: config.isStatic ? undefined : query,
    };
    const bind = (spec: typeof config.rootElement): ElementSource => ({
      immutable: spec.isStatic,
      render: () => spec.renderer(options),
      ...(spec.getEtagFromOptions && {
        getEtag: () => spec.getEtagFromOptions!(options),
      }),
    });
    const elements: RouterDefinition['elements'] = {
      root: bind(config.rootElement),
      route: {
        ...bind(config.routeElement),
        cacheKey: getPathSpecCacheId(config.pathSpec),
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
      const params = getPathMapping(config.pathSpec, pathname) ?? {};
      return (req) => config.handler(req, { params });
    }
    return resolveRoute(config, pathname, query);
  };
  return { resolve, resolveElement, resolveRoute };
}
