import type { RouteProps } from '../isomorphic-utils/route-path.js';
import { pathnameToCurrentRoutePath } from './route-url.js';

const SCROLL_KEYS = new Set([
  ' ',
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
  'PageDown',
  'PageUp',
  'Home',
  'End',
]);

const EDITING =
  "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

// the same keys move a caret rather than the page when someone is editing
const scrollsThePage = (event: KeyboardEvent) =>
  !event.defaultPrevented &&
  SCROLL_KEYS.has(event.key) &&
  !(event.target as HTMLElement | null)?.closest?.(EDITING);

const decodeHash = (raw: string) =>
  raw.replace(/(?:%[0-9A-Fa-f]{2})+/g, (escapes) => {
    try {
      return decodeURIComponent(escapes);
    } catch {
      return escapes;
    }
  });

export const getHashElement = (hash: string): HTMLElement | null => {
  const raw = hash.slice(1);
  const decoded = decodeHash(raw);
  for (const name of new Set([raw, decoded])) {
    const byId = document.getElementById(name);
    if (byId) {
      return byId;
    }
    // the spec counts anchors only, not a meta or an input
    for (const named of document.getElementsByName(name)) {
      if (named.localName === 'a') {
        return named;
      }
    }
  }
  return decoded.toLowerCase() === 'top' ? document.documentElement : null;
};

// a slot can resolve without re-rendering the router, so watch the dom
export const watchForHashElement = (
  hash: string,
  behavior: ScrollBehavior,
  onSettled?: () => void,
) => {
  // stop is for the caller putting the watch down, and stays silent so a
  // replayed effect can pick it up again. settle is the target reached or
  // the reader taking over, which nobody should reopen
  const stop = () => {
    observer.disconnect();
    window.removeEventListener('wheel', settle);
    window.removeEventListener('touchmove', settle);
    window.removeEventListener('keydown', settleOnScrollKey);
  };
  const settle = () => {
    stop();
    onSettled?.();
  };
  const settleOnScrollKey = (event: KeyboardEvent) => {
    if (scrollsThePage(event)) {
      settle();
    }
  };
  const observer = new MutationObserver(() => {
    if (getHashElement(hash)) {
      settle();
      scrollToHash(hash, behavior, false);
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['id', 'name'],
  });
  window.addEventListener('wheel', settle, { passive: true });
  window.addEventListener('touchmove', settle, { passive: true });
  window.addEventListener('keydown', settleOnScrollKey);
  return { hash, stop };
};

export const scrollToHash = (
  hash: string,
  behavior: ScrollBehavior,
  scrollTopForMissingHash: boolean,
) => {
  if (hash) {
    const element = getHashElement(hash);
    if (!element) {
      if (!scrollTopForMissingHash) {
        return;
      }
      window.scrollTo({
        left: 0,
        top: 0,
        behavior,
      });
      return;
    }
    const scrollMarginTop =
      Number.parseFloat(window.getComputedStyle(element).scrollMarginTop) || 0;
    window.scrollTo({
      left: 0,
      top:
        element.getBoundingClientRect().top + window.scrollY - scrollMarginTop,
      behavior,
    });
    return;
  }
  window.scrollTo({
    left: 0,
    top: 0,
    behavior,
  });
};

export const shouldScrollByDefault = (url: URL) =>
  pathnameToCurrentRoutePath(url.pathname) !==
    pathnameToCurrentRoutePath(window.location.pathname) ||
  url.hash !== window.location.hash;

export const shouldScrollForRouteChange = (
  next: RouteProps,
  prev: RouteProps,
) => next.path !== prev.path || next.hash !== prev.hash;
