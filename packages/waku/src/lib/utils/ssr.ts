// These constants are defined in packages/waku/src/minimal/client.tsx.
// TODO(daishi): We should avoid duplicating definitions.
const KEY_RESPONSE = 'r';
const KEY_DEBUG_ID = 'd';

const createPrefetchedEntry = (debugId: string | undefined) =>
  `
  {
    ${KEY_RESPONSE}: Promise.resolve(new Response(new ReadableStream({
      start(c) {
        const d = (self.__FLIGHT_DATA ||= []);
        const t = new TextEncoder();
        const f = (s) => c.enqueue(typeof s === 'string' ? t.encode(s) : s);
        d.forEach(f);
        d.length = 0;
        d.push = f;
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => c.close());
        } else {
          c.close();
        }
      }
    }))),
    ${debugId ? `${KEY_DEBUG_ID}: ${JSON.stringify(debugId)},` : ''}
  }
`
    .split('\n')
    .map((line) => line.trim())
    .join('');

export function getBootstrapPreamble(options: {
  rscPath: string;
  hydrate: boolean;
  debugId?: string | undefined;
}) {
  return `
    ${options.hydrate ? 'globalThis.__WAKU_HYDRATE__ = true;' : ''}
    globalThis.__WAKU_PREFETCHED__ = {
      ${JSON.stringify(options.rscPath)}: ${createPrefetchedEntry(options.debugId)},
    };
  `;
}
