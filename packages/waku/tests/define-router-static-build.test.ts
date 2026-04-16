import { describe, expect, it, vi } from 'vitest';
import { unstable_defineRouter } from '../src/router/define-router.js';

describe('define-router handleBuild', () => {
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

    const makeStream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        },
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
