import { describe, expect, it } from 'vitest';
import {
  HAS404_ID,
  IS_ORIGIN_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  getRouteFromElements,
  has404FromElements,
  isMetaKey,
  isStaticFromElements,
} from '../src/router/isomorphic-utils/router-protocol.js';

describe('router protocol readers', () => {
  it('reads route, static, and 404 from elements', () => {
    const elements = {
      [ROUTE_ID]: ['/about', 'q=1'],
      [IS_STATIC_ID]: true,
      [HAS404_ID]: true,
    };
    expect(getRouteFromElements(elements)).toEqual({
      path: '/about',
      query: 'q=1',
      hash: '',
    });
    expect(isStaticFromElements(elements)).toBe(true);
    expect(has404FromElements(elements)).toBe(true);
  });

  it('treats missing meta as undefined / false', () => {
    expect(getRouteFromElements({})).toBeUndefined();
    expect(isStaticFromElements({})).toBe(false);
    expect(has404FromElements({})).toBe(false);
  });

  it('isMetaKey matches ROUTE_ID, IS_STATIC_ID, HAS404_ID', () => {
    expect(isMetaKey(ROUTE_ID)).toBe(true);
    expect(isMetaKey(IS_STATIC_ID)).toBe(true);
    expect(isMetaKey(IS_ORIGIN_ID)).toBe(false);
    expect(isMetaKey(HAS404_ID)).toBe(true);
    expect(isMetaKey('page:index')).toBe(false);
  });
});
