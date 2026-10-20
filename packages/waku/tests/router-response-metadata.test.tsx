// @vitest-environment happy-dom

import { Suspense, act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { formatRscUrl } from '../src/lib/utils-isomorphic/rsc-path.js';
import { clearInitialRscEntries } from '../src/minimal/client-utils/initial-rsc-store.js';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  unstable_getElementResponse as getElementResponse,
  useFetchRsc_UNSTABLE as useFetchRsc,
  useRegisterRscEnhancer_UNSTABLE as useRegisterRscEnhancer,
} from '../src/minimal/client.js';
import { getRouterCache } from '../src/router/client-core-utils/caches.js';
import { encodeRoutePath } from '../src/router/isomorphic-utils/router-protocol.js';

vi.mock('react-server-dom-webpack/client', () => ({
  default: {
    createFromFetch: async (response: Promise<Response>) =>
      (await response).json(),
    encodeReply: async (value: unknown) => JSON.stringify(value),
    createTemporaryReferenceSet: () => new Map(),
  },
}));

const request = vi.fn<typeof fetch>();
const roots: ReturnType<typeof createRoot>[] = [];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', request);
  request.mockReset();
  request.mockImplementation(async () => Response.json({ content: 'initial' }));
});

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  clearInitialRscEntries();
  vi.unstubAllGlobals();
});

const mount = async () => {
  let api!: {
    fetch: ReturnType<typeof useFetchRsc>;
    register: ReturnType<typeof useRegisterRscEnhancer>;
  };
  const Probe = () => {
    const fetch = useFetchRsc();
    const register = useRegisterRscEnhancer();
    useEffect(() => {
      api = { fetch, register };
    });
    return <Slot id="content" />;
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(
      <Suspense fallback="pending">
        <Root initialRscPath="initial">
          <Probe />
        </Root>
      </Suspense>,
    );
  });
  return { register: api.register, cache: getRouterCache(api.fetch) };
};

const createRedirectResponse = (content: string, query: string) => {
  const url = formatRscUrl(
    encodeRoutePath('/exists'),
    new URL('http://localhost'),
  );
  url.searchParams.set('query', query);
  const response = Response.json({
    content,
    ROUTE: ['/exists', ''],
    IS_STATIC: true,
  });
  Object.defineProperties(response, {
    url: { value: url.href },
    redirected: { value: true },
  });
  return response;
};

test.each([false, true])(
  'parallel requests use the selected response query (rebuilt: %s)',
  async (rebuild) => {
    const { register, cache } = await mount();
    const selected = createRedirectResponse(
      'selected',
      'callbackUrl=%2Fguarded',
    );
    const discarded = Promise.withResolvers<Response>();
    request
      .mockResolvedValueOnce(selected)
      .mockReturnValueOnce(discarded.promise);
    register(
      (next) => (path, params, options) =>
        next(path, params, {
          ...options,
          fetch: async (input, init) => {
            const first = options.fetch(input, init);
            const second = options.fetch(input, init);
            const chosen = await first;
            discarded.resolve(
              createRedirectResponse('discarded', 'callbackUrl=%2Fdiscarded'),
            );
            const unused = await second;
            await unused.body?.cancel();
            return rebuild ? new Response(chosen.body, chosen) : chosen;
          },
        }),
    );
    const elements = await cache.fetchRsc(encodeRoutePath('/guarded'));
    expect(elements.content).toBe('selected');
    expect(elements.ROUTE).toEqual(['/exists', 'callbackUrl=%2Fguarded']);
  },
);

test('ambiguous body transformations do not borrow another response query', async () => {
  const { register, cache } = await mount();
  request.mockResolvedValueOnce(
    createRedirectResponse('selected', 'callbackUrl=%2Fguarded'),
  );
  request.mockResolvedValueOnce(
    createRedirectResponse('discarded', 'callbackUrl=%2Fdiscarded'),
  );
  register(
    (next) => (path, params, options) =>
      next(path, params, {
        ...options,
        fetch: async (input, init) => {
          const chosen = await options.fetch(input, init);
          const unused = await options.fetch(input, init);
          await unused.body?.cancel();
          return new Response(await chosen.text(), chosen);
        },
      }),
  );
  const elements = await cache.fetchRsc(encodeRoutePath('/guarded'));
  expect(elements.content).toBe('selected');
  expect(elements.ROUTE).toEqual(['/exists', '']);
  expect(getElementResponse(elements, 'ROUTE')).toBeUndefined();
});
