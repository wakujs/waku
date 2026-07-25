/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ETAG_ID_PREFIX, IMMUTABLE_ETAG } from '../src/lib/utils/etags.js';
import {
  ROUTER_STATE_ID,
  canCommitInstantly,
  getCommittedRoute,
  getRouterState,
  makeRouterState,
  pinForSwr,
} from '../src/router/client-utils/router-state.js';
import {
  IS_STATIC_ID,
  ROUTE_ID,
} from '../src/router/isomorphic-utils/route-path.js';

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
});

const route = (path: string, query = '', hash = '') => ({ path, query, hash });

const urlOf = (path: string) => new URL(path, window.location.origin);

const withRouterState = (
  elements: Record<string, unknown>,
  routerState: ReturnType<typeof makeRouterState>,
) => ({ ...elements, [ROUTER_STATE_ID]: routerState });

describe('makeRouterState', () => {
  test('captures the url, the attempted route and the intents', () => {
    const routerState = makeRouterState(
      route('/a', 'x=1'),
      urlOf('/a?x=1#top'),
      {
        history: 'push',
        scroll: true,
        pathChanged: true,
      },
    );
    expect(routerState.url).toBe('/a?x=1#top');
    expect(routerState.attempted).toEqual(['/a', 'x=1']);
    expect(routerState.history).toBe('push');
    expect(routerState.scroll).toEqual({ pathChanged: true });
    expect(routerState.scrollIntent).toBe(true);
  });

  test('no scroll intent when scrolling is off', () => {
    const routerState = makeRouterState(route('/a'), urlOf('/a'), {
      history: 'replace',
      scroll: false,
      pathChanged: true,
    });
    expect(routerState.scroll).toBeNull();
    expect(routerState.scrollIntent).toBe(false);
  });
});

describe('getCommittedRoute', () => {
  test('commits nothing until the client has navigated', () => {
    expect(getCommittedRoute({ [ROUTE_ID]: ['/a', ''] }, '/fallback')).toBe(
      undefined,
    );
  });

  test('path from the elements, query and hash from the routerState url', () => {
    const routerState = makeRouterState(
      route('/a', 'x=1'),
      urlOf('/a?x=1#top'),
      {
        history: 'replace',
        scroll: false,
        pathChanged: false,
      },
    );
    const elements = withRouterState(
      { [ROUTE_ID]: ['/a', 'x=1'] },
      routerState,
    );
    const { route: committedRoute, url } = getCommittedRoute(elements, '/f')!;
    expect(committedRoute).toEqual(route('/a', 'x=1', '#top'));
    expect(url.pathname).toBe('/a');
    expect(getRouterState(elements)).toBe(routerState);
  });

  test('a static response does not echo the query; the routerState url keeps it', () => {
    const routerState = makeRouterState(route('/a', 'x=1'), urlOf('/a?x=1'), {
      history: 'replace',
      scroll: false,
      pathChanged: false,
    });
    const elements = withRouterState(
      { [ROUTE_ID]: ['/a', ''], [IS_STATIC_ID]: true },
      routerState,
    );
    const { route: committedRoute, url } = getCommittedRoute(elements, '/f')!;
    expect(committedRoute.query).toBe('x=1');
    expect(url.search).toBe('?x=1');
  });

  test('a server redirect moves the route and the url', () => {
    const routerState = makeRouterState(route('/a'), urlOf('/a'), {
      history: 'push',
      scroll: false,
      pathChanged: true,
    });
    const elements = withRouterState(
      { [ROUTE_ID]: ['/b', 'y=2'] },
      routerState,
    );
    const { route: committedRoute, url } = getCommittedRoute(elements, '/f')!;
    expect(committedRoute).toEqual(route('/b', 'y=2'));
    expect(url.pathname).toBe('/b');
    expect(url.search).toBe('?y=2');
  });

  test('a server redirect keeps the base path in the url', () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/docs/');
    try {
      const routerState = makeRouterState(route('/a'), urlOf('/docs/a'), {
        history: 'replace',
        scroll: false,
        pathChanged: false,
      });
      const elements = withRouterState({ [ROUTE_ID]: ['/b', ''] }, routerState);
      const { url } = getCommittedRoute(elements, '/f')!;
      expect(url.pathname).toBe('/docs/b');
    } finally {
      vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
    }
  });

  test('a server redirect to the 404 route keeps the attempted url', () => {
    const routerState = makeRouterState(route('/missing'), urlOf('/missing'), {
      history: 'replace',
      scroll: false,
      pathChanged: true,
    });
    const elements = withRouterState({ [ROUTE_ID]: ['/404', ''] }, routerState);
    const { route: committedRoute, url } = getCommittedRoute(elements, '/f')!;
    expect(committedRoute.path).toBe('/404');
    expect(url.pathname).toBe('/missing');
  });
});

describe('canCommitInstantly', () => {
  const immutable = (slotId: string) => ({
    [ETAG_ID_PREFIX + slotId]: IMMUTABLE_ETAG,
  });

  test('true when the resolved elements hold an immutable route slot', () => {
    expect(
      canCommitInstantly('route:/a', immutable('route:/a'), undefined),
    ).toBe(true);
  });

  test('true when only the prefetched elements hold it', () => {
    expect(canCommitInstantly('route:/a', {}, immutable('route:/a'))).toBe(
      true,
    );
  });

  test('false without an immutable etag for the slot', () => {
    expect(
      canCommitInstantly(
        'route:/a',
        { [ETAG_ID_PREFIX + 'route:/a']: 'W/"mutable"' },
        null,
      ),
    ).toBe(false);
  });
});

describe('pinForSwr', () => {
  const immutable = (slotId: string) => ({
    [ETAG_ID_PREFIX + slotId]: IMMUTABLE_ETAG,
  });

  test('pins meta keys and immutable slots, not mutable ones', () => {
    const pin = pinForSwr(() => immutable('layout:/'));
    expect(pin(ROUTE_ID)).toBe(true);
    expect(pin('layout:/')).toBe(true);
    expect(pin('page:/a')).toBe(false);
  });

  test('reads the resolved elements at call time', () => {
    let resolved: Record<string, unknown> = {};
    const pin = pinForSwr(() => resolved);
    expect(pin('layout:/')).toBe(false);
    resolved = immutable('layout:/');
    expect(pin('layout:/')).toBe(true);
  });
});
