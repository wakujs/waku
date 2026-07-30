import { createInitialRscEntryCode } from './initial-rsc.js';

/**
 * Recovers from the entry chunk itself failing to load — the one dynamic
 * import in this document (`@vitejs/plugin-rsc`'s bootstrap
 * `import(entryUrl)`, appended right after this preamble) that Vite's own
 * `__vitePreload` helper never wraps, since nothing has loaded yet for it to
 * rewrite. During the version-skew window this build id exists to detect,
 * that import can 404 (a deploy host hasn't atomically flipped the served
 * document and its asset manifest together), and a failed `import()` never
 * throws synchronously — it surfaces only as `unhandledrejection`, never
 * `vite:preloadError`, so `entry.browser.tsx`'s own listener (which recovers
 * a *lazy* chunk failing once the entry itself is already running) cannot
 * fire for this one. Each engine phrases a failed dynamic import
 * differently, so this matches substrings that hold across Chromium,
 * Firefox, and Safari rather than one exact string.
 *
 * Bounded to one reload per document: this runs ahead of hydration, so
 * there's nothing yet to hand a budget back to on success the way a mounted
 * app could. A version-skew window is measured in seconds, so one attempt is
 * what it needs.
 *
 * Unconditional rather than gated on `WAKU_BUILD_ID` the way
 * `entry.browser.tsx`'s own listener is: that gate is truthy in dev too (the
 * plugin defines it `'dev'`, not empty, outside a real build), so it already
 * guards nothing in practice, and this listener is inert unless the exact
 * failure it matches actually occurs.
 */
const ENTRY_IMPORT_RECOVERY = `
addEventListener("unhandledrejection",function(e){
  var m=e&&e.reason&&e.reason.message;
  if(typeof m!=="string")return;
  m=m.toLowerCase();
  if(m.indexOf("failed to fetch dynamically imported module")<0&&
     m.indexOf("error loading dynamically imported module")<0&&
     m.indexOf("importing a module script failed")<0)return;
  try{
    var k="waku:entry-import-reload";
    if(sessionStorage.getItem(k))return;
    sessionStorage.setItem(k,"1");
  }catch(_){return}
  e.preventDefault();
  location.reload();
});
`.trim();

export function getBootstrapPreamble(options: {
  hydrate: boolean;
  debugId?: string | undefined;
}) {
  return `
    ${options.hydrate ? 'globalThis.__WAKU_HYDRATE__ = true;' : ''}
    globalThis.__WAKU_INITIAL_RSC__ = ${createInitialRscEntryCode(
      options.debugId,
    )};
    ${ENTRY_IMPORT_RECOVERY}
  `;
}
