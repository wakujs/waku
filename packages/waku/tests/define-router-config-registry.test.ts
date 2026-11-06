import { describe, expect, it, vi } from 'vitest';
import { createConfigRegistry } from '../src/router/create-pages-utils/config-registry.js';
import type { RuntimeConfig } from '../src/router/create-pages-utils/config.js';
import type { PathSpec } from '../src/router/isomorphic-utils/path-spec.js';

// element-cache (pulled in transitively) imports these; the registry never uses them.
vi.mock('../src/server.js', () => ({
  deserializeRsc: vi.fn(),
  serializeRsc: vi.fn(),
}));

const literal = (name: string): PathSpec => [{ type: 'literal', name }];

const route = (
  name: string,
  opts: {
    isStatic?: boolean;
    elements?: Record<string, unknown>;
    pathPatternSpec?: PathSpec;
  } = {},
): RuntimeConfig =>
  ({
    type: 'route',
    pathSpec: literal(name),
    isStatic: opts.isStatic ?? false,
    rootElement: { isStatic: false, renderer: () => `root:${name}` },
    routeElement: { isStatic: false, renderer: () => `route:${name}` },
    elements: opts.elements ?? {},
    ...(opts.pathPatternSpec ? { pathPatternSpec: opts.pathPatternSpec } : {}),
  }) as unknown as RuntimeConfig;

const api = (name: string): RuntimeConfig =>
  ({
    type: 'api',
    pathSpec: literal(name),
    isStatic: false,
    handler: async () => new Response('ok'),
  }) as unknown as RuntimeConfig;

const slice = (
  id: string,
  opts: { pathSpec?: PathSpec; isStatic?: boolean } = {},
): RuntimeConfig =>
  ({
    type: 'slice',
    id,
    isStatic: opts.isStatic ?? false,
    renderer: async () => `slice:${id}`,
    ...(opts.pathSpec ? { pathSpec: opts.pathSpec } : {}),
  }) as unknown as RuntimeConfig;

describe('config registry initialization', () => {
  it('throws "configs not initialized" from accessors before initialize', () => {
    const registry = createConfigRegistry(async () => [route('a')]);
    expect(() => registry.getAll()).toThrow('configs not initialized');
    expect(() => registry.has404()).toThrow('configs not initialized');
    expect(() => registry.findPathConfig('/a')).toThrow(
      'configs not initialized',
    );
  });

  it('rejects reserved element ids during initialize', async () => {
    const registry = createConfigRegistry(async () => [
      route('a', {
        elements: { root: { isStatic: false, renderer: () => 'x' } },
      }),
    ]);
    await expect(registry.initialize()).rejects.toThrow('Element ID cannot be');
  });

  it('rejects a static slice that declares a pathSpec', async () => {
    const registry = createConfigRegistry(async () => [
      slice('s', { isStatic: true, pathSpec: literal('s') }),
    ]);
    await expect(registry.initialize()).rejects.toThrow(
      'static slice "s" cannot have a pathSpec',
    );
  });
});

describe('config registry queries', () => {
  it('detects whether a 404 route exists', async () => {
    const with404 = createConfigRegistry(async () => [route('404')]);
    await with404.initialize();
    expect(with404.has404()).toBe(true);

    const without = createConfigRegistry(async () => [route('home')]);
    await without.initialize();
    expect(without.has404()).toBe(false);
  });

  it('matches route/api by path and slice by id', async () => {
    const registry = createConfigRegistry(async () => [
      route('page'),
      api('data'),
      slice('sb'),
    ]);
    await registry.initialize();
    expect(registry.findPathConfig('/page')?.type).toBe('route');
    expect(registry.findPathConfig('/data')?.type).toBe('api');
    expect(registry.findPathConfig('/nope')).toBeUndefined();
    expect(registry.findSliceConfig('sb')?.sliceConfig.id).toBe('sb');
    expect(registry.findSliceConfig('missing')).toBeUndefined();
  });
});
