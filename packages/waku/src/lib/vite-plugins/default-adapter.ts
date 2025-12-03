import type { Plugin } from 'vite';

export function defaultAdapterPlugin(adapterName: string): Plugin {
  const adapterModule = 'waku/adapters/default';
  return {
    name: 'waku:vite-plugins:default-adapter',
    enforce: 'pre',
    async resolveId(source, _importer, options) {
      if (source === adapterModule) {
        const resolved = await this.resolve(adapterName, undefined, {
          ...options,
          skipSelf: true,
        });
        if (!resolved) {
          return this.error(
            `Failed to resolve adapter package: ${adapterName}`,
          );
        }
        return resolved;
      }
    },
  };
}
