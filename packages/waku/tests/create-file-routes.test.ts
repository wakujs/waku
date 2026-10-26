import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createConfiguredRouter } from '../src/router/create-pages-utils/router.js';
import { createPages } from '../src/router/create-pages.js';
import { fsRouter } from '../src/router/fs-router.js';

vi.mock('../src/router/create-pages-utils/router.js', () => ({
  createConfiguredRouter: vi.fn(),
}));

const Page = () => null;
const Layout = () => null;
const Root = () => null;
const getConfig = async () => ({ render: 'dynamic' as const });
const module = async () => ({ default: Page });
const dynamicModule = async () => ({ default: Page, getConfig });

const configuration = () =>
  vi.mocked(createConfiguredRouter).mock.calls.at(-1)![0];
const configs = async () => Array.from(await configuration().getConfigs!());

beforeEach(() => vi.clearAllMocks());

describe('unstable_createFileRoutes', () => {
  it('shares file roots and layouts with explicit routes and retains sources', async () => {
    const load = vi.fn(module);
    createPages(async ({ unstable_createFileRoutes, createPage }) => {
      await unstable_createFileRoutes({
        './pages/_root.tsx': async () => ({ default: Root }),
        './pages/_layout.tsx': async () => ({ default: Layout }),
        './pages/index.tsx': load,
        './pages/blog/[slug].tsx': dynamicModule,
      });
      return [
        createPage({ path: '/configured', component: Page, render: 'static' }),
      ];
    });
    const routes = await configs();
    expect(routes).toHaveLength(3);
    const explicit = routes.find(
      (route) => route.type === 'route' && 'page:/configured' in route.elements,
    );
    expect(explicit).toMatchObject({
      type: 'route',
      rootElement: { sourceFile: 'pages/_root.tsx' },
      elements: { 'layout:/': { sourceFile: 'pages/_layout.tsx' } },
    });
    expect(routes).toContainEqual(
      expect.objectContaining({
        type: 'route',
        elements: expect.objectContaining({
          'page:/': expect.objectContaining({ sourceFile: 'pages/index.tsx' }),
        }),
      }),
    );
    await configs();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'rejects duplicate paths regardless of registration order (files first: %s)',
    async (filesFirst) => {
      createPages(async ({ unstable_createFileRoutes, createPage }) => {
        const files = () =>
          unstable_createFileRoutes({ './pages/about.tsx': module });
        if (filesFirst) {
          await files();
        }
        const page = createPage({
          path: '/about',
          component: Page,
          render: 'static',
        });
        if (!filesFirst) {
          await files();
        }
        return [page];
      });
      await expect(configs()).rejects.toThrow('Duplicated path: /about');
    },
  );

  it.each([
    ['/blog/[slug]', './pages/blog/[id].tsx'],
    ['/blog/[...rest]', './pages/blog/[...parts].tsx'],
    ['/(team)/blog/[slug]', './pages/blog/[id].tsx'],
  ] as const)(
    'rejects equivalent dynamic page patterns: %s',
    async (path, file) => {
      createPages(async ({ createPage, unstable_createFileRoutes }) => {
        await unstable_createFileRoutes({ [file]: dynamicModule });
        return [createPage({ path, component: Page, render: 'dynamic' })];
      });
      await expect(configs()).rejects.toThrow(
        'Duplicated dynamic route pattern:',
      );
    },
  );

  it('retains specificity for literal routes overlapping dynamic routes', async () => {
    createPages(async ({ unstable_createFileRoutes, createPage }) => {
      await unstable_createFileRoutes({
        './pages/blog/[slug].tsx': dynamicModule,
      });
      return [
        createPage({ path: '/blog/new', component: Page, render: 'static' }),
      ];
    });
    const routes = await configs();
    expect(
      routes.map((route) => route.type === 'route' && route.pathSpec),
    ).toEqual([
      [
        { type: 'literal', name: 'blog' },
        { type: 'literal', name: 'new' },
      ],
      [
        { type: 'literal', name: 'blog' },
        { type: 'group', name: 'slug' },
      ],
    ]);
  });

  it('preserves APIs, slices, interceptors, directory options and ignored files', async () => {
    const interceptor = vi.fn(async (next: () => Promise<unknown>) => next());
    const ignored = vi.fn(module);
    const GET = async () => new Response('ok');
    createPages(async ({ unstable_createFileRoutes }) => {
      await unstable_createFileRoutes(
        {
          './routes/index.tsx': module,
          './routes/api/health.ts': async () => ({ GET }),
          './routes/slices/banner.tsx': module,
          './routes/hooks/log.ts': async () => ({ default: interceptor }),
          './pages/outside.tsx': ignored,
          './routes/_components/private.tsx': ignored,
          './routes/_hooks/use-example.ts': ignored,
        },
        {
          pagesDir: 'routes',
          apiDir: 'api',
          slicesDir: 'slices',
          interceptorsDir: 'hooks',
        },
      );
      return [];
    });
    const routes = await configs();
    expect(routes.map((route) => route.type)).toEqual(
      expect.arrayContaining(['route', 'api', 'slice']),
    );
    expect(configuration().unstable_interceptors).toEqual([interceptor]);
    expect(ignored).not.toHaveBeenCalled();
  });

  it('propagates module and getConfig failures', async () => {
    createPages(async ({ unstable_createFileRoutes }) => {
      await unstable_createFileRoutes({
        './pages/index.tsx': async () => {
          throw new Error('load failed');
        },
      });
      return [];
    });
    await expect(configs()).rejects.toThrow('load failed');
    createPages(async ({ unstable_createFileRoutes }) => {
      await unstable_createFileRoutes({
        './pages/index.tsx': async () => ({
          default: Page,
          getConfig: async () => {
            throw new Error('config failed');
          },
        }),
      });
      return [];
    });
    await expect(configs()).rejects.toThrow('config failed');
  });

  it('allows fsRouter to omit options', async () => {
    fsRouter({ './pages/index.tsx': module });
    expect(await configs()).toHaveLength(1);
    expect(configuration().unstable_skipBuild).toBeUndefined();
  });

  it('keeps fsRouter as a file-only shorthand including skipBuild', async () => {
    const skip = () => true;
    fsRouter({ './pages/index.tsx': module }, { unstable_skipBuild: skip });
    const fromFs = await configs();
    expect(configuration().unstable_skipBuild).toBe(skip);
    createPages(
      async ({ unstable_createFileRoutes }) => {
        await unstable_createFileRoutes({ './pages/index.tsx': module });
        return [];
      },
      { unstable_skipBuild: skip },
    );
    const fromPages = await configs();
    expect(fromPages).toHaveLength(fromFs.length);
    expect(fromPages[0]).toMatchObject({
      type: 'route',
      pathSpec: [],
      isStatic: true,
    });
    expect(configuration().unstable_skipBuild).toBe(skip);
  });
});
