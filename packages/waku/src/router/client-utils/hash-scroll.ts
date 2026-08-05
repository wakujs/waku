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
export const watchForHashElement = (hash: string, behavior: ScrollBehavior) => {
  const stop = () => {
    observer.disconnect();
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchmove', stop);
    window.removeEventListener('keydown', stopOnScrollKey);
  };
  // tabbing or typing is not a reader taking over the scroll position
  const stopOnScrollKey = (event: KeyboardEvent) => {
    if (SCROLL_KEYS.has(event.key)) {
      stop();
    }
  };
  const observer = new MutationObserver(() => {
    if (getHashElement(hash)) {
      stop();
      scrollToHash(hash, behavior, false);
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['id', 'name'],
  });
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchmove', stop, { passive: true });
  window.addEventListener('keydown', stopOnScrollKey);
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
