import type { Plugin } from 'vite';
import { SRC_CLIENT_ENTRY, SRC_SERVER_ENTRY } from '../constants.js';
import {
  getManagedClientEntry,
  getManagedServerEntry,
} from '../utils/managed.js';

export function userEntriesPlugin({ srcDir }: { srcDir: string }): Plugin {
  let rootDir = process.cwd();
  return {
    name: 'waku:vite-plugins:user-entries',
    configResolved(config) {
      rootDir = config.root;
    },
    // resolve user entries and fallbacks to "managed mode" if not found.
    async resolveId(source, _importer, options) {
      if (
        source === 'virtual:vite-rsc-waku/server-entry-runtime' ||
        source === 'virtual:vite-rsc-waku/server-entry-build'
      ) {
        return '\0' + source;
      }
      if (
        source === 'virtual:vite-rsc-waku/server-entry-inner-runtime' ||
        source === 'virtual:vite-rsc-waku/server-entry-inner-build'
      ) {
        const resolved = await this.resolve(
          `/${srcDir}/${SRC_SERVER_ENTRY}`,
          undefined,
          options,
        );
        return resolved ? resolved : '\0' + source;
      }
      if (source === 'virtual:vite-rsc-waku/client-entry') {
        const resolved = await this.resolve(
          `/${srcDir}/${SRC_CLIENT_ENTRY}`,
          undefined,
          options,
        );
        return resolved ? resolved : '\0' + source;
      }
    },
    load(id) {
      if (id === '\0virtual:vite-rsc-waku/server-entry-runtime') {
        return `\
export { default } from 'virtual:vite-rsc-waku/server-entry-inner-runtime';
if (import.meta.hot) {
  import.meta.hot.accept()
}
`;
      }
      if (id === '\0virtual:vite-rsc-waku/server-entry-build') {
        return `\
export { default } from 'virtual:vite-rsc-waku/server-entry-inner-build';
if (import.meta.hot) {
  import.meta.hot.accept()
}
`;
      }
      if (id === '\0virtual:vite-rsc-waku/server-entry-inner-runtime') {
        return getManagedServerEntry({
          rootDir,
          srcDir,
          mode: this.environment.mode === 'build' ? 'runtime' : 'dev',
        });
      }
      if (id === '\0virtual:vite-rsc-waku/server-entry-inner-build') {
        return getManagedServerEntry({
          rootDir,
          srcDir,
          mode: 'build',
        });
      }
      if (id === '\0virtual:vite-rsc-waku/client-entry') {
        return getManagedClientEntry();
      }
    },
  };
}
