/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  MAX_FOLLOWS_PER_NAVIGATION,
  decideRouteIntent,
} from '../src/router/client-core-utils/route-follow.js';
import { parseRoute } from '../src/router/client-core-utils/route-url.js';

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
});

const options = { has404: false, maxFollows: MAX_FOLLOWS_PER_NAVIGATION };
const at = (href: string, follows = 0) => {
  const url = new URL(href, window.location.href);
  return { route: parseRoute(url), url, follows };
};
const redirect = (location: string, href = '/from', follows = 0) =>
  decideRouteIntent({ status: 307, location }, at(href, follows), options);

describe('route intents', () => {
  test('an app path retains its query and hash and restores the base path', () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/docs/');
    expect(redirect('/next?a=1#frag', '/docs/from')).toEqual({
      type: 'follow',
      target: { path: '/next', query: 'a=1', hash: '#frag' },
      url: new URL('/docs/next?a=1#frag', window.location.href),
    });
  });

  test.each([
    'https://other.example/next',
    window.location.origin + '/next',
    '//other.example/next',
  ])('a document destination leaves: %s', (location) => {
    expect(redirect(location).type).toBe('leave');
  });

  test('credentials never reach the address bar', () => {
    expect(redirect('https://user:pw@example.com/next')).toEqual({
      type: 'leave',
      url: new URL('https://example.com/next'),
    });
  });

  test.each(['javascript:alert(1)', 'https://[', 'ftp://user:pw@host/x'])(
    'an unsafe destination stops without exposing credentials: %s',
    (location) => {
      const decision = redirect(location);
      expect(decision).toMatchObject({
        type: 'stop',
        error: expect.any(Error),
      });
      if (decision.type === 'stop') {
        expect(String(decision.error)).not.toContain('user:pw');
      }
    },
  );

  test('a 404 follows the custom page with the requested query and URL', () => {
    const requested = at('/missing?foo=bar#frag');
    expect(
      decideRouteIntent({ status: 404 }, requested, {
        ...options,
        has404: true,
      }),
    ).toEqual({
      type: 'follow',
      target: { path: '/404', query: 'foo=bar', hash: '' },
      url: requested.url,
    });
    expect(decideRouteIntent({ status: 404 }, requested, options)).toEqual({
      type: 'none',
    });
  });

  test('a redirect back to the same route and URL stops as a loop', () => {
    expect(redirect('/here#frag', '/here#frag')).toMatchObject({
      type: 'stop',
      error: { message: 'detected a navigation loop' },
    });
  });

  test.each(['/here?q=2', '/here#frag'])(
    'a changed query or hash is a new destination: %s',
    (location) => {
      expect(redirect(location, '/here').type).toBe('follow');
    },
  );

  test('follows share a bounded budget, with loops reported first', () => {
    expect(redirect('/next', '/from', 19).type).toBe('follow');
    expect(redirect('/next', '/from', 20)).toMatchObject({
      type: 'stop',
      error: { message: 'too many redirect or 404 follows' },
    });
    expect(redirect('/here', '/here', 20)).toMatchObject({
      type: 'stop',
      error: { message: 'detected a navigation loop' },
    });
  });
});
