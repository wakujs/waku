import { test, describe, expect } from 'vitest';
import {
  extname,
  parsePathWithSlug,
  path2regexp,
  getPathMapping,
  withTrialSlash,
  withoutTrialSlash,
  withoutBase,
} from '../src/lib/utils/path.js';

function matchPath(path: string, input: string) {
  return new RegExp(path2regexp(parsePathWithSlug(path))).test(input);
}

describe('extname', () => {
  test('returns the extension of a path', () => {
    expect(extname('foo/bar/baz.js')).toBe('.js');
    expect(extname('foo/bar/baz')).toBe('');
    expect(extname('foo/bar/.baz')).toBe('');
    expect(extname('foo/bar/..baz')).toBe('');
  });
});

describe('path2regexp', () => {
  test('handles paths without slugs', () => {
    expect(matchPath('/foo/bar', '/foo/bar')).toBe(true);
    expect(matchPath('/foo/baz', '/foo/bar')).toBe(false);
  });

  test('handles paths with groups', () => {
    expect(matchPath('/foo/[x]/[y]', '/foo/bar/baz')).toBe(true);
    expect(matchPath('/foo/[x]/[y]', '/foo/baz/bar')).toBe(true);
    expect(matchPath('/bar/[x]/[y]', '/foo/bar')).toBe(false);
    expect(matchPath('/foo/[x]/[y]', '/foo/bar/baz/qux')).toBe(false);
  });

  test('handles paths with wildcards', () => {
    expect(matchPath('/foo/[...x]', '/foo/bar/baz/qux')).toBe(true);
    expect(matchPath('/foo/[...x]', '/foo/bar')).toBe(true);
    expect(matchPath('/foo/[...x]', '/foo')).toBe(false);
    expect(matchPath('/foo/[...x]', '/bar')).toBe(false);
  });

  test('handles paths with groups and wildcards', () => {
    expect(matchPath('/foo/[x]/[...y]', '/foo/bar/baz/qux')).toBe(true);
    expect(matchPath('/foo/[x]/[...y]', '/foo/bar')).toBe(false);
    expect(matchPath('/foo/[x]/[...y]', '/foo')).toBe(false);
    expect(matchPath('/foo/[x]/[...y]', '/bar')).toBe(false);
  });
});

describe('getPathMapping', () => {
  test('handles literal paths', () => {
    const pathSpec = parsePathWithSlug('/foo/bar');
    expect(getPathMapping(pathSpec, '/foo/bar')).toEqual({});
    expect(getPathMapping(pathSpec, '/foo/baz')).toBe(null);
  });

  test('handles paths with groups', () => {
    const pathSpec = parsePathWithSlug('/foo/[id]');
    expect(getPathMapping(pathSpec, '/foo/123')).toEqual({ id: '123' });
    expect(getPathMapping(pathSpec, '/foo/bar')).toEqual({ id: 'bar' });
    expect(getPathMapping(pathSpec, '/foo')).toBe(null);
  });

  test('handles paths with wildcards', () => {
    const pathSpec = parsePathWithSlug('/foo/[...path]');
    expect(getPathMapping(pathSpec, '/foo/bar/baz')).toEqual({
      path: ['bar', 'baz'],
    });
    expect(getPathMapping(pathSpec, '/foo/bar')).toEqual({ path: ['bar'] });
    expect(getPathMapping(pathSpec, '/foo')).toBe(null);
  });

  test('handles wildcard at root level matching index route', () => {
    const pathSpec = parsePathWithSlug('/[...catchAll]');
    expect(getPathMapping(pathSpec, '/')).toEqual({ catchAll: [] });
    expect(getPathMapping(pathSpec, '/foo')).toEqual({ catchAll: ['foo'] });
    expect(getPathMapping(pathSpec, '/foo/bar')).toEqual({
      catchAll: ['foo', 'bar'],
    });
  });

  test('handles wildcard with prefix matching index', () => {
    const pathSpec = parsePathWithSlug('/prefix/[...path]');
    expect(getPathMapping(pathSpec, '/prefix')).toBe(null);
    expect(getPathMapping(pathSpec, '/prefix/foo')).toEqual({ path: ['foo'] });
  });
});

describe('withTrialSlash', () => {
  test('adds a trailing slash if not present', () => {
    expect(withTrialSlash('/foo/bar')).toBe('/foo/bar/');
    expect(withTrialSlash('/foo/bar/')).toBe('/foo/bar/');
    expect(withTrialSlash('/')).toBe('/');
  });
});

describe('withoutTrialSlash', () => {
  test('removes a trailing slash if present', () => {
    expect(withoutTrialSlash('/foo/bar/')).toBe('/foo/bar');
    expect(withoutTrialSlash('/foo/bar')).toBe('/foo/bar');
    expect(withoutTrialSlash('/')).toBe('/');
  });
});

describe('withoutBase', () => {
  test('removes the base path if present', () => {
    expect(withoutBase('/base/foo/bar', '/base',)).toBe('/foo/bar');
    expect(withoutBase('/base/foo/bar/', '/base',)).toBe('/foo/bar/');
    expect(withoutBase('/foo/bar', '/base',)).toBe('/foo/bar');
    expect(withoutBase('/base', '/base',)).toBe('/');
    expect(withoutBase('/base/', '/base',)).toBe('/');
    expect(withoutBase('/', '/base',)).toBe('/');
  });
});
