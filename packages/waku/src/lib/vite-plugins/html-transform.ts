import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { DEFAULT_METADATA_FILTER } from '../utils/html-metadata.js';
import type { MetadataFilter } from '../utils/html-metadata.js';

type HtmlTransformOptions = {
  /**
   * Merge duplicate metadata in the SSR head, keeping the last declaration of
   * each key. `false` emits the head as rendered.
   *
   * Only keys their consumers resolve to the first occurrence belong here:
   * React re-adds on hydration any tag missing from the served HTML, appending
   * it after the survivor, which inverts a key like `viewport`.
   *
   * @defaultValue `true`
   */
  mergeMetadata?: boolean | Partial<MetadataFilter>;
};

const MODULE_ID = 'virtual:vite-rsc-waku/html-transform';

export function htmlTransformPlugin(
  options: HtmlTransformOptions = {},
): Plugin {
  const { mergeMetadata = true } = options;
  const runtime = fileURLToPath(
    new URL('../utils/html-metadata.js', import.meta.url),
  );
  return {
    name: 'waku:vite-plugins:html-transform',
    resolveId(source, _importer, _options) {
      return source === MODULE_ID ? '\0' + MODULE_ID : undefined;
    },
    load(id) {
      if (id !== '\0' + MODULE_ID) {
        return;
      }
      if (!mergeMetadata) {
        return `export default undefined;`;
      }
      const filter: MetadataFilter = {
        ...DEFAULT_METADATA_FILTER,
        ...(mergeMetadata === true ? {} : mergeMetadata),
      };
      return `
import { dedupeHtmlMetadataStream } from ${JSON.stringify(runtime)};
const filter = ${JSON.stringify(filter)};
export default () => dedupeHtmlMetadataStream(filter);
`;
    },
  };
}
