import type { ReactNode } from 'react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  ETAG_ID_PREFIX,
  SKIP_HEADER,
  encodeRoutePath,
} from '../src/router/common.js';
import { unstable_defineRouter } from '../src/router/define-router.js';

vi.mock('../src/server.js', () => ({
  // Static slots round-trip through serialize/deserialize; for these tests the
  // identity of the deserialized element does not matter, only its presence.
  deserializeRsc: vi.fn().mockResolvedValue('static-element'),
  serializeRsc: vi.fn().mockResolvedValue(new Uint8Array([1])),
}));

const makeStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
  });

type Option = { routePath: string; query: string | undefined };

type ElementSpec = {
  isStatic: boolean;
  renderer: (option: Option) => ReactNode;
  getEtagFromOption?: (option: Option) => Promise<string | undefined>;
};

const buildRouter = (elements: Record<string, ElementSpec>) =>
  unstable_defineRouter({
    getConfigs: async () => [
      {
        type: 'route' as const,
        path: [{ type: 'literal' as const, name: 'foo' }],
        isStatic: false,
        rootElement: { isStatic: false, renderer: () => 'root' },
        routeElement: { isStatic: false, renderer: () => 'route' },
        elements,
      },
    ],
  });

// Drive a single RSC ("component") request and capture the entries record that
// the router hands to renderRsc, so we can assert which slots were sent.
const getEntries = async (
  router: ReturnType<typeof unstable_defineRouter>,
  clientEtags?: Record<string, string>,
): Promise<Record<string, unknown>> => {
  let captured: Record<string, unknown> = {};
  await router.handleRequest(
    {
      type: 'component',
      pathname: '/foo',
      rscPath: encodeRoutePath('/foo'),
      rscParams: undefined,
      req: new Request('http://localhost/foo', {
        headers: clientEtags
          ? { [SKIP_HEADER]: JSON.stringify(clientEtags) }
          : {},
      }),
    },
    {
      renderRsc: vi.fn(async (entries: unknown) => {
        captured = entries as Record<string, unknown>;
        return makeStream();
      }),
      parseRsc: vi.fn(),
      renderHtml: vi.fn(),
      loadBuildMetadata: vi.fn(),
    },
  );
  return captured;
};

const etagKey = (slotId: string) => `${ETAG_ID_PREFIX}${slotId}`;

describe('define-router etags (element tag skip)', () => {
  it('sends a dynamic slot with its etag when the client has none', async () => {
    const router = buildRouter({
      page: {
        isStatic: false,
        renderer: () => createElement('div', null, 'page'),
        getEtagFromOption: async () => 'v1',
      },
    });

    const entries = await getEntries(router);
    expect('page' in entries).toBe(true);
    expect(entries[etagKey('page')]).toBe('v1');
  });

  it('omits a dynamic slot when the client etag still matches', async () => {
    const router = buildRouter({
      page: {
        isStatic: false,
        renderer: () => createElement('div', null, 'page'),
        getEtagFromOption: async () => 'v1',
      },
    });

    const entries = await getEntries(router, { page: 'v1' });
    expect('page' in entries).toBe(false);
    expect(etagKey('page') in entries).toBe(false);
  });

  it('re-sends a dynamic slot with the new etag when it changed', async () => {
    let tag = 'v1';
    const router = buildRouter({
      page: {
        isStatic: false,
        renderer: () => createElement('div', null, 'page'),
        getEtagFromOption: async () => tag,
      },
    });

    // The tag changed (e.g. after an invalidation) -> getEtag returns it.
    tag = 'v2';
    const entries = await getEntries(router, { page: 'v1' });
    expect('page' in entries).toBe(true);
    expect(entries[etagKey('page')]).toBe('v2');
  });

  it('always sends a dynamic slot without a getEtag (no etag carried)', async () => {
    const router = buildRouter({
      page: {
        isStatic: false,
        renderer: () => createElement('div', null, 'page'),
      },
    });

    const entries = await getEntries(router);
    expect('page' in entries).toBe(true);
    expect(etagKey('page') in entries).toBe(false);
  });

  it('clears a stale etag when a dynamic slot no longer provides one', async () => {
    let tag: string | undefined = 'v1';
    const router = buildRouter({
      page: {
        isStatic: false,
        renderer: () => createElement('div', null, 'page'),
        getEtagFromOption: async () => tag,
      },
    });

    // The slot drops its tag; the client still holds 'v1', so the slot is sent
    // with an empty tag to clear it.
    tag = undefined;
    const entries = await getEntries(router, { page: 'v1' });
    expect('page' in entries).toBe(true);
    expect(entries[etagKey('page')]).toBe('');
  });

  it('uses the constant "static" etag for static slots and omits on match', async () => {
    const router = buildRouter({
      page: { isStatic: true, renderer: () => createElement('div') },
    });

    const first = await getEntries(router);
    expect('page' in first).toBe(true);
    expect(first[etagKey('page')]).toBe('static');

    const second = await getEntries(router, { page: 'static' });
    expect('page' in second).toBe(false);
    expect(etagKey('page') in second).toBe(false);
  });

  it('ignores a getEtag on a static slot (tag stays "static")', async () => {
    const router = buildRouter({
      page: {
        isStatic: true,
        renderer: () => createElement('div'),
        getEtagFromOption: async () => 'should-be-ignored',
      },
    });

    const entries = await getEntries(router);
    expect(entries[etagKey('page')]).toBe('static');
  });

  it('passes the element option to getEtag', async () => {
    const seen: unknown[] = [];
    const router = buildRouter({
      page: {
        isStatic: false,
        renderer: () => createElement('div'),
        getEtagFromOption: async (option) => {
          seen.push(option);
          return 'v1';
        },
      },
    });

    await getEntries(router);
    expect(seen).toContainEqual(expect.objectContaining({ routePath: '/foo' }));
  });

  it('applies the same etag skip to a dynamic slice', async () => {
    let sliceTag = 'sv1';
    const router = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route' as const,
          path: [{ type: 'literal' as const, name: 'foo' }],
          isStatic: false,
          rootElement: { isStatic: false, renderer: () => 'root' },
          routeElement: { isStatic: false, renderer: () => 'route' },
          elements: {},
          slices: ['mySlice'],
        },
        {
          type: 'slice' as const,
          id: 'mySlice',
          isStatic: false,
          renderer: async () => createElement('div', null, 'slice'),
          getEtagFromParams: async () => sliceTag,
        },
      ],
    });
    const slot = 'slice:mySlice';

    const first = await getEntries(router);
    expect(slot in first).toBe(true);
    expect(first[etagKey(slot)]).toBe('sv1');

    const omitted = await getEntries(router, { [slot]: 'sv1' });
    expect(slot in omitted).toBe(false);

    // Slice invalidated -> tag changed -> re-sent.
    sliceTag = 'sv2';
    const resent = await getEntries(router, { [slot]: 'sv1' });
    expect(slot in resent).toBe(true);
    expect(resent[etagKey(slot)]).toBe('sv2');
  });

  it('applies the etag skip to the root element', async () => {
    let tag = 'r1';
    const router = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route' as const,
          path: [{ type: 'literal' as const, name: 'foo' }],
          isStatic: false,
          rootElement: {
            isStatic: false,
            renderer: () => 'root',
            getEtagFromOption: async () => tag,
          },
          routeElement: { isStatic: false, renderer: () => 'route' },
          elements: {},
        },
      ],
    });

    const first = await getEntries(router);
    expect('root' in first).toBe(true);
    expect(first[etagKey('root')]).toBe('r1');

    const omitted = await getEntries(router, { root: 'r1' });
    expect('root' in omitted).toBe(false);

    // Root invalidated -> tag changed -> re-sent.
    tag = 'r2';
    const resent = await getEntries(router, { root: 'r1' });
    expect('root' in resent).toBe(true);
    expect(resent[etagKey('root')]).toBe('r2');
  });
});
