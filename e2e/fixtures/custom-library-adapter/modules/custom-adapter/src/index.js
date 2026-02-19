import { unstable_createServerEntryAdapter as createServerEntryAdapter } from 'waku/adapter-builders';

export default createServerEntryAdapter(
  ({ processRequest, processBuild, config }) => {
    const buildOptions = {
      distDir: config.distDir,
      marker: 'custom-adapter-post-build',
    };
    return {
      async fetch(req) {
        const res = await processRequest(req);
        return res ?? new Response('Not Found', { status: 404 });
      },
      build: processBuild,
      buildOptions,
      buildEnhancers: ['custom-adapter/build-enhancer'],
    };
  },
);
