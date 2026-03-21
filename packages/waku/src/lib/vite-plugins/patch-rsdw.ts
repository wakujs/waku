import type { Plugin } from 'vite';

// Waku sends RSC payloads as plain objects (Record<string, unknown>).
// In React's flushComponentPerformance, moveDebugInfoFromChunkToInnerValue
// uses splice(0) which empties chunk._debugInfo after resolution. React main
// has a fallback that recovers _debugInfo from the resolved value, but only
// for arrays, async iterables, React elements, and lazy types — not plain
// objects. This transform relaxes that restriction so _debugInfo is recovered
// from any object, which is needed for Waku's plain-object payloads to show
// the "Server Components" track in Chrome DevTools Performance tab.
const SEARCH = 'debugInfo = root._debugInfo;';
const REPLACE = `
${SEARCH}
if (debugInfo && 0 === debugInfo.length && "fulfilled" === root.status) {
  var _resolved = typeof resolveLazy === "function" ? resolveLazy(root.value) : root.value;
  if ("object" === typeof _resolved && null !== _resolved && isArrayImpl(_resolved._debugInfo)) {
    debugInfo = _resolved._debugInfo;
  }
}
`;

export function patchRsdwPlugin(): Plugin {
  return {
    name: 'waku:vite-plugins:patch-rsdw',
    enforce: 'pre',
    transform(code, id) {
      const [file] = id.split('?');
      if (
        ![
          '/react-server-dom-webpack-client.browser.development.js',
          '/react-server-dom-webpack_client__browser.js',
        ].some((suffix) => file!.endsWith(suffix))
      ) {
        return;
      }
      const patched = code.replace(SEARCH, REPLACE);
      if (patched === code) {
        return;
      }
      return patched;
    },
  };
}
