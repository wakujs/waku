import { describe, expect, it, vi } from 'vitest';
import { unstable_defineRouter } from '../src/router/define-router.js';

const makeStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
  });

describe('define-router handleBuild', () => {
  it('caches static elements inside routes whose path is non-literal', async () => {
    const layoutRenderer = vi.fn(() => null);
    const pageRenderer = vi.fn(() => null);
    const { handleBuild } = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route',
          path: [
            { type: 'literal', name: 'nested' },
            { type: 'group', name: 'name' },
          ],
          isStatic: false,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'layout:/nested': { isStatic: true, renderer: layoutRenderer },
            'page:/nested/[name]': {
              isStatic: false,
              renderer: pageRenderer,
            },
          },
        },
      ],
    });

    const saveBuildMetadata = vi.fn().mockResolvedValue(undefined);
    await handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      parseRsc: vi.fn().mockResolvedValue({}),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      rscPath2pathname: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata,
      withRequest: <T>(_req: Request, fn: () => T) => fn(),
      generateFile: vi.fn().mockResolvedValue(undefined),
      generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
    });

    // Static elements inside a dynamic-path route should still be cached
    // at build time so the runtime can serve them without invoking the
    // renderer (which is essential for safely pruning their source files).
    expect(layoutRenderer).toHaveBeenCalled();
    const cached = saveBuildMetadata.mock.calls.find(
      ([key]) => key === 'defineRouter:cachedElements',
    );
    expect(cached, 'cachedElements should be saved').toBeDefined();
    const cachedEntries = JSON.parse(cached![1]);
    expect(Object.keys(cachedEntries)).toContain('layout:/nested');
  });

  it('wraps EEXIST on static wildcard emit with a clear error', async () => {
    const { handleBuild } = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'api',
          handler: async () => Response.json('test'),
          isStatic: true,
          path: [{ type: 'literal', name: 'test' }],
        },
        {
          type: 'api',
          handler: async () => Response.json('test'),
          isStatic: true,
          path: [
            { type: 'literal', name: 'test' },
            { type: 'literal', name: 'route' },
          ],
        },
      ],
    });

    const written = new Map<string, 'dir' | 'file'>();
    const generateFile = vi.fn(async (fileName: string) => {
      const segments = fileName.split('/').filter(Boolean);
      for (let i = 0; i < segments.length; i++) {
        const seg = segments.slice(0, i + 1).join('/');
        const type = i === segments.length - 1 ? 'file' : 'dir';
        if (written.has(seg) && written.get(seg) !== type) {
          const err = new Error('EEXIST');
          Object.assign(err, { code: 'EEXIST' });
          throw err;
        }
        written.set(seg, type);
      }
    });

    await expect(
      handleBuild({
        renderRsc: () => Promise.resolve(makeStream()),
        parseRsc: vi.fn(),
        renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
        rscPath2pathname: (rscPath: string) => `dist/${rscPath}.txt`,
        saveBuildMetadata: vi.fn().mockResolvedValue(undefined),
        withRequest: <T>(_req: Request, fn: () => T) => fn(),
        generateFile,
        generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(Error);
      const msg = (err as Error).message;
      expect(msg).toBe(
        'the API route /test/route faced file-system conflicts when writing static responses, this often happens because of empty segments in "staticPaths".',
      );
      return true;
    });
  });
});
