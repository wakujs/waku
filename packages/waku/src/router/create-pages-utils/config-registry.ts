import { getPathMapping } from '../isomorphic-utils/path-spec.js';
import type { PathSpec } from '../isomorphic-utils/path-spec.js';
import { pathnameToRoutePath } from '../isomorphic-utils/route-path.js';
import type { RuntimeConfig, SliceConfig } from './config.js';
import { assertNonReservedSlotId } from './element-ids.js';

const is404 = (pathSpec: PathSpec) =>
  pathSpec.length === 1 &&
  pathSpec[0]!.type === 'literal' &&
  pathSpec[0]!.name === '404';

export type ConfigRegistry = ReturnType<typeof createConfigRegistry>;

export function createConfigRegistry(
  getConfigs: () => Promise<Iterable<RuntimeConfig>>,
) {
  let cachedConfigs: RuntimeConfig[] | undefined;
  let cachedHas404 = false;

  const initialize = async () => {
    const configs = Array.from(await getConfigs());
    configs.forEach((item) => {
      if (item.type === 'route') {
        Object.keys(item.elements).forEach(assertNonReservedSlotId);
      } else if (item.type === 'slice') {
        if (item.isStatic && item.pathSpec) {
          throw new Error(
            `defineRouter: static slice "${item.id}" cannot have a pathSpec`,
          );
        }
      }
    });
    cachedConfigs = configs;
    cachedHas404 = configs.some(
      (item) => item.type === 'route' && is404(item.pathSpec),
    );
  };

  const getAll = (): RuntimeConfig[] => {
    if (!cachedConfigs) {
      throw new Error('defineRouter: configs not initialized');
    }
    return cachedConfigs;
  };

  const has404 = (): boolean => {
    if (!cachedConfigs) {
      throw new Error('defineRouter: configs not initialized');
    }
    return cachedHas404;
  };

  const findPathConfig = (pathname: string) => {
    const routePath = pathnameToRoutePath(pathname);
    return getAll().find(
      (item): item is typeof item & { type: 'route' | 'api' } =>
        (item.type === 'route' || item.type === 'api') &&
        !!getPathMapping(item.pathSpec, routePath),
    );
  };

  const findSliceConfig = (
    sliceId: string,
  ):
    | { sliceConfig: SliceConfig; params?: Record<string, string | string[]> }
    | undefined => {
    const slicePath = '/' + sliceId;
    for (const item of getAll()) {
      if (item.type !== 'slice') {
        continue;
      }
      if (item.id === sliceId) {
        return { sliceConfig: item };
      }
      if (item.pathSpec) {
        const params = getPathMapping(item.pathSpec, slicePath);
        if (params) {
          return { sliceConfig: item, params };
        }
      }
    }
    return undefined;
  };

  return {
    initialize,
    getAll,
    has404,
    findPathConfig,
    findSliceConfig,
  };
}
