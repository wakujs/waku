// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBootstrapPreamble } from '../src/lib/utils/ssr.js';

describe('getBootstrapPreamble', () => {
  it('provides the initial RSC payload separately from client prefetches', () => {
    const preamble = getBootstrapPreamble({
      hydrate: true,
      debugId: 'debug-1',
    });
    expect(preamble).toContain('globalThis.__WAKU_INITIAL_RSC__ = (() =>');
    // The initial entry carries the streamed Response and its debug id.
    expect(preamble).toContain('e.response = Promise.resolve(new Response(');
    expect(preamble).toContain('e.debugId = "debug-1";');
  });

  it('omits the debug id when not provided', () => {
    expect(getBootstrapPreamble({ hydrate: true })).not.toContain(
      'e.debugId =',
    );
  });

  it('includes the entry-import recovery listener on both the hydrate and SSR-fallback paths', () => {
    // The bootstrap `import(entryUrl)` this preamble precedes runs on both
    // paths (see `renderHtmlStream` in `vite-rsc/ssr.tsx`), so both need the
    // listener that recovers from it failing to load.
    expect(getBootstrapPreamble({ hydrate: true })).toContain(
      'addEventListener("unhandledrejection"',
    );
    expect(getBootstrapPreamble({ hydrate: false })).toContain(
      'addEventListener("unhandledrejection"',
    );
  });
});

/**
 * Runs the emitted preamble's own source rather than a re-typed copy of its
 * logic — the point of these tests is the exact string that reaches the
 * document, so a drift between what is tested and what ships would defeat
 * them.
 */
function armEntryImportRecovery(): void {
  new Function(getBootstrapPreamble({ hydrate: true })).call(window);
}

/** The event a native `import()` rejection dispatches when nothing catches
    it. `PromiseRejectionEvent` isn't constructible under happy-dom, so a
    plain cancelable `Event` stands in with `reason` assigned — the script
    only ever reads `e.reason.message`. */
function unhandledRejection(message: string): Event {
  const event = new Event('unhandledrejection', { cancelable: true });
  Object.assign(event, { reason: new Error(message) });
  return event;
}

describe('entry-import recovery', () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [
      'Chromium',
      'Failed to fetch dynamically imported module: https://example.com/entry.js',
    ],
    [
      'Firefox',
      'error loading dynamically imported module: https://example.com/entry.js',
    ],
    ['Safari', 'Importing a module script failed.'],
  ])(
    'reloads once when the entry import rejects (%s wording)',
    (_engine, message) => {
      armEntryImportRecovery();

      const event = unhandledRejection(message);
      window.dispatchEvent(event);

      expect(reload).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    },
  );

  it('ignores a rejection unrelated to a failed module import', () => {
    armEntryImportRecovery();

    const event = unhandledRejection('Network request failed');
    window.dispatchEvent(event);

    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('stops reloading once one attempt is spent', () => {
    armEntryImportRecovery();

    const message = 'Failed to fetch dynamically imported module: x';
    window.dispatchEvent(unhandledRejection(message));
    const second = unhandledRejection(message);
    window.dispatchEvent(second);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
  });

  it('loads the page even where storage is blocked', () => {
    const blocked = () => {
      throw new Error('storage blocked');
    };
    vi.stubGlobal('sessionStorage', {
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
    });
    armEntryImportRecovery();

    const event = unhandledRejection(
      'Failed to fetch dynamically imported module: x',
    );
    expect(() => window.dispatchEvent(event)).not.toThrow();

    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
