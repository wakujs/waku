import { describe, expect, it } from 'vitest';
import { getPathSpecKey } from '../src/router/create-pages-utils/config.js';
import type { PathSpec } from '../src/router/isomorphic-utils/path-spec.js';

const path = (name: string): PathSpec => [{ type: 'literal', name }];

describe('getPathSpecKey', () => {
  it('is stable for equal specs and distinct for different specs', () => {
    expect(getPathSpecKey(path('foo'))).toBe(getPathSpecKey(path('foo')));
    expect(getPathSpecKey(path('foo'))).not.toBe(getPathSpecKey(path('bar')));
  });
});
