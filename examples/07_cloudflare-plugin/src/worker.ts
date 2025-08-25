import handler from 'waku/lib/vite-entries/entry.server.edge';

export default {
  fetch: async (request) => {
    return handler(request);
  },
} satisfies ExportedHandler;

// TODO
// export { handleBuild } from 'waku/lib/vite-entries/entry.server.edge'
export function handleBuild() {
  return {
    buildConfigs: (async function* () {})(),
  };
}
