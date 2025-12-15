import { unstable_createServerEntryAdapter as createServerEntryAdapter } from 'waku/internals';

export default createServerEntryAdapter(({ processRequest, processBuild, config }) => {
  return {
    async fetch(req, ...args) {
      const res = await processRequest(req, ...args);
      return res ?? new Response('Not Found', { status: 404 });
    },
    build: processBuild,
    postBuild: [
      new URL('./custom-post-build.js', import.meta.url).href,
      { distDir: config.distDir, marker: 'custom-user-adapter' },
    ],
  };
});
