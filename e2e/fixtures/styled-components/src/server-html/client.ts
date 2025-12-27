declare global {
  var __addServerInsertedHTML: ((callback: () => string) => void) | undefined;
}

/**
 * Registers a callback to insert HTML during SSR (similar to Next.js's `useServerInsertedHTML`).
 * The callback result is inserted into the HTML stream before </head>.
 * No-op on the client side.
 */
export function insertServerHTML(callback: () => string): void {
  // Uses global to avoid importing Node.js built-ins (async_hooks) in client-bundled code
  globalThis.__addServerInsertedHTML?.(callback);
}
