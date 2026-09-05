import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeFuncId, encodeRscPath } from '../src/lib/utils/rsc-path.js';
import {
  encodeRoutePath,
  encodeSliceId,
} from '../src/router/isomorphic-utils/route-path.js';
import {
  formatRouterRequest,
  parseRouterRequest,
} from '../src/router/server-utils/parse-router-request.js';

const req = (url: string) => new Request(url);

// the url the client router actually fetches for a route
const rscUrl = (routePath: string, query = '') =>
  'http://localhost/RSC/' +
  encodeRscPath(encodeRoutePath(routePath)) +
  (query ? '?' + query : '');

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parseRouterRequest', () => {
  it('reads a document request as its route', () => {
    expect(parseRouterRequest(req('http://localhost/dashboard'))).toEqual({
      type: 'route',
      path: '/dashboard',
      query: '',
    });
  });

  it('reads the rsc request for the same route identically', () => {
    expect(parseRouterRequest(req(rscUrl('/dashboard')))).toEqual({
      type: 'route',
      path: '/dashboard',
      query: '',
    });
  });

  it.each(['/', '/_foo', '/dashboard/invoices', '/a/b/c'])(
    'agrees between both url shapes for %s',
    (path) => {
      expect(parseRouterRequest(req(rscUrl(path)))).toEqual(
        parseRouterRequest(req('http://localhost' + path)),
      );
    },
  );

  it('keeps the query from either shape', () => {
    expect(parseRouterRequest(req('http://localhost/x?a=1'))).toMatchObject({
      query: 'a=1',
    });
    expect(parseRouterRequest(req(rscUrl('/x', 'a=1')))).toMatchObject({
      query: 'a=1',
    });
  });

  it('reports a server action as an action, with no route', () => {
    const url =
      'http://localhost/RSC/' +
      encodeRscPath(encodeFuncId('src/actions.ts#deleteInvoice'));
    expect(parseRouterRequest(req(url))).toEqual({ type: 'action' });
  });

  it('reports a slice request', () => {
    const url = 'http://localhost/RSC/' + encodeRscPath(encodeSliceId('one'));
    expect(parseRouterRequest(req(url))).toEqual({ type: 'slice', id: 'one' });
  });

  it('honours a custom basePath and rscBase', () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/app/');
    vi.stubEnv('WAKU_CONFIG_RSC_BASE', '_rsc');
    expect(parseRouterRequest(req('http://localhost/app/dashboard'))).toEqual({
      type: 'route',
      path: '/dashboard',
      query: '',
    });
    const url =
      'http://localhost/app/_rsc/' +
      encodeRscPath(encodeRoutePath('/dashboard'));
    expect(parseRouterRequest(req(url))).toEqual({
      type: 'route',
      path: '/dashboard',
      query: '',
    });
  });

  it('returns null outside basePath', () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/app/');
    expect(parseRouterRequest(req('http://localhost/elsewhere'))).toBeNull();
  });

  it('returns null for an undecodable rsc url', () => {
    expect(
      parseRouterRequest(req('http://localhost/RSC/not-encoded')),
    ).toBeNull();
  });

  it('reads a path with no route as a route: existence is the caller’s job', () => {
    expect(parseRouterRequest(req('http://localhost/favicon.ico'))).toEqual({
      type: 'route',
      path: '/favicon.ico',
      query: '',
    });
  });
});

describe('formatRouterRequest', () => {
  it('rewrites a document request to the document url of another route', () => {
    const out = formatRouterRequest(req('http://localhost/old'), '/new');
    expect(out?.pathname).toBe('/new');
  });

  it('rewrites an rsc request to the rsc url of another route', () => {
    const out = formatRouterRequest(req(rscUrl('/old')), '/new');
    expect(out?.pathname).toBe(new URL(rscUrl('/new')).pathname);
  });

  it('round-trips through parseRouterRequest', () => {
    for (const path of ['/', '/_foo', '/a/b/c']) {
      for (const from of ['http://localhost/old', rscUrl('/old')]) {
        const out = formatRouterRequest(req(from), path);
        expect(parseRouterRequest(req(out!.href))).toMatchObject({
          type: 'route',
          path,
        });
      }
    }
  });

  it('carries the original query unless one is given', () => {
    expect(
      formatRouterRequest(req('http://localhost/old?a=1'), '/new')?.search,
    ).toBe('?a=1');
    expect(
      formatRouterRequest(req('http://localhost/old?a=1'), '/new', 'b=2')
        ?.search,
    ).toBe('?b=2');
  });

  it('honours a custom basePath', () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/app/');
    expect(
      formatRouterRequest(req('http://localhost/app/old'), '/new')?.pathname,
    ).toBe('/app/new');
  });

  it('returns null for an action, which has no route to rewrite', () => {
    const url =
      'http://localhost/RSC/' + encodeRscPath(encodeFuncId('src/a.ts#go'));
    expect(formatRouterRequest(req(url), '/new')).toBeNull();
  });
});
