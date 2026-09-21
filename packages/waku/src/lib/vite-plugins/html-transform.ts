import { fileURLToPath } from 'node:url';
import { normalizePath } from 'vite';
import type { Plugin } from 'vite';
import type { MetadataFilter } from '../utils/html-metadata.js';

type HtmlTransformOptions = {
  /**
   * The defaults fill in what a partial filter leaves out. Name only keys
   * whose consumers resolve the first occurrence: React appends on hydration
   * whatever the served HTML omits, which inverts any other.
   */
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
      const args = [JSON.stringify(mergeMetadata ?? {})];
      if (maxBufferedHead !== undefined) {
        args.push(String(maxBufferedHead));
      }
      return `
import { dedupeHtmlMetadataStream } from ${JSON.stringify(runtime)};
export default () => dedupeHtmlMetadataStream(${args.join(', ')});
`;
    },
  };
}
