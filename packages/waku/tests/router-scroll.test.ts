/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  getHashElementForTest,
  scrollToHash,
  shouldScrollByDefault,
  shouldScrollForRouteChange,
} from '../src/router/client-utils/scroll.js';

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
});

afterEach(() => {
  vi.unstubAllEnvs();
  document.body.innerHTML = '';
});

const append = (html: string) => {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host;
};

describe('getHashElement', () => {
  test('an id wins, and an anchor name counts', () => {
    append('<a name="intro">by name</a><div id="body">by id</div>');
    expect(getHashElementForTest('#body')?.id).toBe('body');
    expect(getHashElementForTest('#intro')?.localName).toBe('a');
  });

  test('a named element that is not an anchor is not a target', () => {
    append('<input name="section" /><meta name="description" />');
    expect(getHashElementForTest('#section')).toBeNull();
    expect(getHashElementForTest('#description')).toBeNull();
  });

  test('a percent encoded name decodes', () => {
    append('<div id="café au lait">x</div><div id="あ">y</div>');
    expect(getHashElementForTest('#caf%C3%A9%20au%20lait')?.textContent).toBe(
      'x',
    );
    expect(getHashElementForTest('#%E3%81%82')?.textContent).toBe('y');
  });

  test('a malformed escape leaves that part alone', () => {
    append('<div id="foo bar%ZZ">x</div>');
    expect(getHashElementForTest('#foo%20bar%ZZ')?.textContent).toBe('x');
  });

  test('top means the document, decoded or not, unless something claims it', () => {
    expect(getHashElementForTest('#top')).toBe(document.documentElement);
    expect(getHashElementForTest('#%74op')).toBe(document.documentElement);
    expect(getHashElementForTest('#TOP')).toBe(document.documentElement);
    append('<div id="top">mine</div>');
    expect(getHashElementForTest('#top')?.textContent).toBe('mine');
  });

  test('an unknown fragment finds nothing', () => {
    expect(getHashElementForTest('#nowhere')).toBeNull();
  });
});

describe('scrollToHash', () => {
  test('a missing target scrolls to the top only when asked', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    try {
      scrollToHash('#gone', 'auto', false);
      expect(scrollTo).not.toHaveBeenCalled();
      scrollToHash('#gone', 'instant', true);
      expect(scrollTo).toHaveBeenCalledWith({
        left: 0,
        top: 0,
        behavior: 'instant',
      });
    } finally {
      scrollTo.mockRestore();
    }
  });
});

describe('scroll policy', () => {
  test('a route change scrolls on a new path or a new hash', () => {
    const at = (path: string, hash = '') => ({ path, query: '', hash });
    expect(shouldScrollForRouteChange(at('/b'), at('/a'))).toBe(true);
    expect(shouldScrollForRouteChange(at('/a', '#x'), at('/a'))).toBe(true);
    expect(shouldScrollForRouteChange(at('/a'), at('/a'))).toBe(false);
  });

  test('by default a query only move does not scroll', () => {
    window.history.replaceState({}, '', '/a?x=1#top');
    try {
      const url = (href: string) => new URL(href, window.location.origin);
      expect(shouldScrollByDefault(url('/a?x=2#top'))).toBe(false);
      expect(shouldScrollByDefault(url('/a?x=1#other'))).toBe(true);
      expect(shouldScrollByDefault(url('/b?x=1#top'))).toBe(true);
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });
});
