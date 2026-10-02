import { getPluginApi } from '@vitejs/plugin-rsc';
import type { Plugin } from 'vite';

/**
 * Finds server functions that only client code imports, which plugin-rsc's
 * build does not look for, by scanning the client graph before that build.
 */
export function scanClientPlugin(): Plugin {
  return {
    name: 'waku:vite-plugins:scan-client',
    buildApp: {
      order: 'pre',
      async handler(builder) {
        const { manager } = getPluginApi(builder.config)!;
        const rsc = builder.environments.rsc!;
        const client = builder.environments.client!;
        manager.isScanBuild = true;
        rsc.config.build.write = false;
        client.config.build.write = false;
        await builder.build(rsc);
        await builder.build(client);
        rsc.config.build.write = true;
        client.config.build.write = true;
        manager.isScanBuild = false;
      },
    },
  };
}
