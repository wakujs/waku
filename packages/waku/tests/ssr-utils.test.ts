import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getBootstrapPreamble,
  wrapBootstrapScriptContent,
} from '../src/lib/utils/ssr.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('wrapBootstrapScriptContent', () => {
  it('wraps the plugin-rsc bootstrap import when a build id is set', () => {
    vi.stubEnv('WAKU_BUILD_ID', 'test-build');
    const wrapped = wrapBootstrapScriptContent(
      'import("/assets/index-abc123.js")',
    );
    expect(wrapped).toContain('import("/assets/index-abc123.js").catch');
    expect(wrapped).toContain('vite:preloadError');
    // must remain parseable JS
    expect(() => new Function(wrapped)).not.toThrow();
  });

  it('tolerates surrounding whitespace and a trailing semicolon', () => {
    vi.stubEnv('WAKU_BUILD_ID', 'test-build');
    const wrapped = wrapBootstrapScriptContent(
      '  import("/assets/index-abc123.js");\n',
    );
    expect(wrapped).toContain('import("/assets/index-abc123.js").catch');
    expect(() => new Function(wrapped)).not.toThrow();
  });

  it('handles escaped quotes inside the URL', () => {
    vi.stubEnv('WAKU_BUILD_ID', 'test-build');
    const wrapped = wrapBootstrapScriptContent('import("/a\\"b.js")');
    expect(wrapped).toContain('.catch');
    expect(() => new Function(wrapped)).not.toThrow();
  });

  it('leaves multi-statement content untouched', () => {
    vi.stubEnv('WAKU_BUILD_ID', 'test-build');
    const content = 'import("/a.js"); import("/b.js")';
    expect(wrapBootstrapScriptContent(content)).toBe(content);
  });

  it('leaves unrecognized shapes untouched', () => {
    vi.stubEnv('WAKU_BUILD_ID', 'test-build');
    const content = 'Promise.resolve().then(() => import("/a.js"))';
    expect(wrapBootstrapScriptContent(content)).toBe(content);
  });

  it('is a no-op without a build id', () => {
    const content = 'import("/assets/index-abc123.js")';
    expect(wrapBootstrapScriptContent(content)).toBe(content);
  });
});

describe('version skew recovery code', () => {
  it('emits the reload listener when a build id is set', () => {
    vi.stubEnv('WAKU_BUILD_ID', 'test-build');
    const code = getBootstrapPreamble({ hydrate: false, initialRsc: false });
    expect(code).toContain("addEventListener('vite:preloadError'");
    expect(code).toContain('window.location.reload()');
    expect(() => new Function(code)).not.toThrow();
  });

  it('emits nothing without a build id', () => {
    expect(getBootstrapPreamble({ hydrate: false, initialRsc: false })).toBe(
      '',
    );
  });
});

describe('getBootstrapPreamble', () => {
  it('registers the recovery listener ahead of everything else', () => {
    vi.stubEnv('WAKU_BUILD_ID', 'test-build');
    const preamble = getBootstrapPreamble({ hydrate: true, initialRsc: true });
    expect(preamble).toContain("addEventListener('vite:preloadError'");
    expect(preamble.indexOf('vite:preloadError')).toBeLessThan(
      preamble.indexOf('__WAKU_HYDRATE__'),
    );
  });

  it('omits the listener without a build id', () => {
    const preamble = getBootstrapPreamble({ hydrate: true, initialRsc: true });
    expect(preamble).not.toContain('vite:preloadError');
    expect(preamble).toContain('__WAKU_HYDRATE__');
  });
  it('provides the initial RSC payload separately from client prefetches', () => {
    const preamble = getBootstrapPreamble({
      hydrate: true,
      initialRsc: true,
      debugId: 'debug-1',
    });
    expect(preamble).toContain('globalThis.__WAKU_INITIAL_RSC__ = (() =>');
    // The initial entry carries the streamed Response and its debug id.
    expect(preamble).toContain('e.response = Promise.resolve(new Response(');
    expect(preamble).toContain('e.debugId = "debug-1";');
  });

  it('omits the initial RSC entry when initialRsc is false', () => {
    vi.stubEnv('WAKU_BUILD_ID', 'test-build');
    expect(
      getBootstrapPreamble({ hydrate: true, initialRsc: false }),
    ).not.toContain('__WAKU_INITIAL_RSC__');
  });

  it('emits parseable JS after whitespace stripping', () => {
    vi.stubEnv('WAKU_BUILD_ID', 'test-build');
    const preamble = getBootstrapPreamble({
      hydrate: true,
      initialRsc: true,
      debugId: 'debug-1',
    });
    expect(preamble).not.toContain('\n');
    expect(() => new Function(preamble)).not.toThrow();
  });

  it('omits the debug id when not provided', () => {
    expect(
      getBootstrapPreamble({ hydrate: true, initialRsc: true }),
    ).not.toContain('e.debugId =');
  });
});
