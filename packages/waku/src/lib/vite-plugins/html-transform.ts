import { fileURLToPath } from 'node:url';
import { normalizePath } from 'vite';
import type { Plugin } from 'vite';
import {
  DEFAULT_MAX_BUFFERED_HEAD,
  DEFAULT_METADATA_FILTER,
} from '../utils/html-metadata.js';
import type { MetadataFilter } from '../utils/html-metadata.js';

type HtmlTransformOptions = {
  /** The defaults fill in what a partial filter leaves out. */
  mergeMetadata?: Partial<MetadataFilter> | false;
  /**
   * How much of an unclosed head to buffer before emitting it as rendered.
   * Every buffered byte counts, the RSC payload injected upstream included.
   */
  maxBufferedHead?: number;
};

const MODULE_ID = 'virtual:vite-rsc-waku/html-transform';

export function htmlTransformPlugin(
  options: HtmlTransformOptions = {},
): Plugin {
  const { mergeMetadata, maxBufferedHead } = options;
  const runtime = normalizePath(
    fileURLToPath(new URL('../utils/html-metadata.js', import.meta.url)),
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
      if (mergeMetadata === false) {
        return `export default undefined;`;
      }
      const filter: MetadataFilter = {
        metaNames:
          mergeMetadata?.metaNames ?? DEFAULT_METADATA_FILTER.metaNames,
        metaProperties:
          mergeMetadata?.metaProperties ??
          DEFAULT_METADATA_FILTER.metaProperties,
      };
      const buffered = maxBufferedHead ?? DEFAULT_MAX_BUFFERED_HEAD;
      return `
import { dedupeHtmlMetadataStream } from ${JSON.stringify(runtime)};
const filter = ${JSON.stringify(filter)};
export default () => dedupeHtmlMetadataStream(filter, ${buffered});
`;
    },
  };
}
