import { unstable_createServerEntryAdapter as createServerEntryAdapter } from 'waku/adapter-builders';

type BuildOptions = { distDir: string; marker: string };

export default createServerEntryAdapter(
  ({ processRequest, processBuild, config }) => {
    const buildOptions: BuildOptions = {
      distDir: config.distDir,
      marker: 'custom-user-adapter',
    };
    return {
      async fetch(req) {
        const res = await processRequest(req);
        return res ?? new Response('Not Found', { status: 404 });
      },
      build: processBuild,
      buildOptions,
      buildEnhancers: ['/src/custom-adapter-build-enhancer.js'],
    };
  },
);
