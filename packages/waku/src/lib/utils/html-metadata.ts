import { concatUint8Array } from './stream.js';

// This is not an HTML parser. It reads the head React renders, and stops at
// anything else it finds in one, including markup passed through by
// `dangerouslySetInnerHTML`, so the scan then merges nothing and the response
// is served as rendered.

export type MetadataFilter = {
  metaNames: readonly string[];
  metaProperties: readonly string[];
};

const DEFAULT_METADATA_FILTER: MetadataFilter = {
  metaNames: ['description'],
  metaProperties: [
    'og:title',
    'og:type',
    'og:url',
    'og:description',
    'og:determiner',
    'og:site_name',
    'og:locale',
  ],
};

const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'title']);

const SCANNED_ELEMENTS = new Set([
  ...RAW_TEXT_ELEMENTS,
  'base',
  'head',
  'html',
  'link',
  'meta',
]);

const SLASH = 47;
const GT = 62;
const EQUALS = 61;
const DOUBLE_QUOTE = 34;
const SINGLE_QUOTE = 39;

const isSpace = (code: number): boolean =>
  code === 32 || code === 9 || code === 10 || code === 12 || code === 13;

const endsAttributeName = (code: number): boolean =>
  isSpace(code) || code === EQUALS || code === GT || code === SLASH;

const endsBareValue = (code: number): boolean => isSpace(code) || code === GT;

const endsTagName = (code: number): boolean =>
  isSpace(code) || code === SLASH || code === GT;

type Tag = {
  name: string;
  closing: boolean;
  end: number;
  attributes: Map<string, string>;
};

const readTag = (html: string, start: number): Tag | undefined => {
  let cursor = start + 1;
  const closing = html.charCodeAt(cursor) === SLASH;
  if (closing) {
    cursor++;
  }
  const nameStart = cursor;
  while (cursor < html.length && !endsTagName(html.charCodeAt(cursor))) {
    cursor++;
  }
  const name = html.slice(nameStart, cursor).toLowerCase();
  const attributes = new Map<string, string>();
  while (cursor < html.length) {
    const code = html.charCodeAt(cursor);
    if (isSpace(code)) {
      cursor++;
      continue;
    }
    if (code === GT) {
      return { name, closing, end: cursor + 1, attributes };
    }
    if (code === SLASH) {
      cursor++;
      continue;
    }
    // An `=` in the name position starts an attribute name rather than
    // ending an empty one, so the first character is always part of it.
    const attributeStart = cursor;
    cursor++;
    while (
      cursor < html.length &&
      !endsAttributeName(html.charCodeAt(cursor))
    ) {
      cursor++;
    }
    const attribute = html.slice(attributeStart, cursor).toLowerCase();
    while (cursor < html.length && isSpace(html.charCodeAt(cursor))) {
      cursor++;
    }
    if (html.charCodeAt(cursor) !== EQUALS) {
      if (!attributes.has(attribute)) {
        attributes.set(attribute, '');
      }
      continue;
    }
    cursor++;
    while (cursor < html.length && isSpace(html.charCodeAt(cursor))) {
      cursor++;
    }
    const quote = html.charCodeAt(cursor);
    const quoted = quote === DOUBLE_QUOTE || quote === SINGLE_QUOTE;
    if (quoted) {
      cursor++;
    }
    const valueStart = cursor;
    while (
      cursor < html.length &&
      (quoted
        ? html.charCodeAt(cursor) !== quote
        : !endsBareValue(html.charCodeAt(cursor)))
    ) {
      cursor++;
    }
    if (!attributes.has(attribute)) {
      attributes.set(attribute, html.slice(valueStart, cursor));
    }
    if (quoted) {
      cursor++;
    }
  }
  return undefined;
};

const findRawTextEnd = (html: string, from: number, name: string): number => {
  let cursor = from;
  while ((cursor = html.indexOf('</', cursor)) !== -1) {
    const nameEnd = cursor + 2 + name.length;
    if (
      html.slice(cursor + 2, nameEnd).toLowerCase() === name &&
      endsTagName(html.charCodeAt(nameEnd))
    ) {
      const tag = readTag(html, cursor);
      return tag === undefined ? -1 : tag.end;
    }
    cursor += 2;
  }
  return -1;
};

const findDeclarationEnd = (html: string, start: number): number => {
  if (!html.startsWith('<!--', start)) {
    const end = html.indexOf('>', start + '<!'.length);
    return end === -1 ? -1 : end + 1;
  }
  // `<!-->` closes, but `<!--!>` does not: the bang state needs two hyphens
  // the opener did not supply.
  const plain = html.indexOf('-->', start + '<!'.length);
  const bang = html.indexOf('--!>', start + '<!--'.length);
  if (plain !== -1 && (bang === -1 || plain < bang)) {
    return plain + '-->'.length;
  }
  return bang === -1 ? -1 : bang + '--!>'.length;
};

// `<!--` then `<script` puts the tokenizer in its double escaped state, where
// the next `</script>` does not close the element.
const SCRIPT_OPEN_REGEXP = /<script/i;

const entersDoubleEscape = (content: string): boolean =>
  content.includes('<!--') && SCRIPT_OPEN_REGEXP.test(content);

const readMetadataKeys = (tag: Tag, filter: MetadataFilter): string[] => {
  if (tag.name === 'title') {
    return ['title'];
  }
  if (tag.name !== 'meta') {
    return [];
  }
  const keys: string[] = [];
  const name = tag.attributes.get('name')?.toLowerCase();
  if (name !== undefined && filter.metaNames.includes(name)) {
    keys.push('name:' + name);
  }
  const property = tag.attributes.get('property')?.toLowerCase();
  if (property !== undefined && filter.metaProperties.includes(property)) {
    keys.push('property:' + property);
  }
  return keys;
};

type MetadataSpan = { key: string; start: number; end: number };

type HeadScan = {
  resumeAt: number;
  spans: MetadataSpan[];
  filter: MetadataFilter;
};

const createHeadScan = (filter: Partial<MetadataFilter>): HeadScan => ({
  resumeAt: 0,
  spans: [],
  filter: {
    metaNames: (filter.metaNames ?? DEFAULT_METADATA_FILTER.metaNames).map(
      (name) => name.toLowerCase(),
    ),
    metaProperties: (
      filter.metaProperties ?? DEFAULT_METADATA_FILTER.metaProperties
    ).map((name) => name.toLowerCase()),
  },
});

const scanHead = (html: string, scan: HeadScan): boolean => {
  while (true) {
    const start = html.indexOf('<', scan.resumeAt);
    if (start === -1) {
      scan.resumeAt = html.length;
      return false;
    }
    if (html.startsWith('<!', start)) {
      const end = findDeclarationEnd(html, start);
      if (end === -1) {
        scan.resumeAt = start;
        return false;
      }
      scan.resumeAt = end;
      continue;
    }
    const tag = readTag(html, start);
    if (tag === undefined) {
      scan.resumeAt = start;
      return false;
    }
    if (!SCANNED_ELEMENTS.has(tag.name)) {
      scan.spans.length = 0;
      return true;
    }
    if (tag.closing) {
      if (tag.name === 'head') {
        return true;
      }
      // A parser ends the head at `</html>` too, and carries on in a body the
      // scan does not model. Every other close tag here it ignores.
      if (tag.name === 'html') {
        scan.spans.length = 0;
        return true;
      }
      scan.resumeAt = tag.end;
      continue;
    }
    let end = tag.end;
    if (RAW_TEXT_ELEMENTS.has(tag.name)) {
      end = findRawTextEnd(html, tag.end, tag.name);
      if (end === -1) {
        scan.resumeAt = start;
        return false;
      }
      if (
        tag.name === 'script' &&
        entersDoubleEscape(html.slice(tag.end, end))
      ) {
        scan.spans.length = 0;
        return true;
      }
    }
    const [key, ...rest] = readMetadataKeys(tag, scan.filter);
    if (key !== undefined) {
      // A tag carrying a second name, or an `itemprop` that takes it out of
      // the document's metadata, is one identity the splice can place and
      // one it cannot: whichever way it went, it would shadow the tag that
      // supersedes it.
      if (rest.length > 0 || tag.attributes.has('itemprop')) {
        scan.spans.length = 0;
        return true;
      }
      scan.spans.push({ key, start, end });
    }
    scan.resumeAt = end;
  }
};

const findSuperseded = (spans: readonly MetadataSpan[]): MetadataSpan[] => {
  const lastStartByKey = new Map<string, number>();
  for (const span of spans) {
    lastStartByKey.set(span.key, span.start);
  }
  return spans.filter((span) => lastStartByKey.get(span.key) !== span.start);
};

const rewriteMetadata = (
  head: string,
  spans: readonly MetadataSpan[],
): string => {
  let result = '';
  let cursor = 0;
  for (const span of findSuperseded(spans)) {
    result += head.slice(cursor, span.start);
    cursor = span.end;
  }
  return result + head.slice(cursor);
};

const spliceMetadata = (
  buffer: Uint8Array,
  spans: readonly MetadataSpan[],
): Uint8Array => {
  const parts: Uint8Array[] = [];
  let cursor = 0;
  for (const span of findSuperseded(spans)) {
    parts.push(buffer.subarray(cursor, span.start));
    cursor = span.end;
  }
  parts.push(buffer.subarray(cursor));
  return concatUint8Array(parts);
};

const DEFAULT_MAX_BUFFERED_HEAD = 1024 * 1024;

const MAX_SPREAD_ARGUMENTS = 0x400;

// The splice cuts the buffer at offsets this string yields, so a byte has to
// stay one character: utf-8 would collapse a multi-byte sequence into one.
const bytesToLatin1 = (bytes: Uint8Array): string => {
  let text = '';
  for (let i = 0; i < bytes.length; i += MAX_SPREAD_ARGUMENTS) {
    text += String.fromCharCode(...bytes.subarray(i, i + MAX_SPREAD_ARGUMENTS));
  }
  return text;
};

export const dedupeHeadMetadataForTest = (
  head: string,
  filter: Partial<MetadataFilter> = {},
): string => {
  const scan = createHeadScan(filter);
  return scanHead(head, scan) ? rewriteMetadata(head, scan.spans) : head;
};

export const dedupeHtmlMetadataStream = (
  filter: Partial<MetadataFilter> = {},
  maxBufferedHead = DEFAULT_MAX_BUFFERED_HEAD,
): TransformStream<Uint8Array, Uint8Array> => {
  const chunks: Uint8Array[] = [];
  let html = '';
  const scan = createHeadScan(filter);
  let buffering = true;

  return new TransformStream({
    transform(chunk, controller) {
      if (!buffering) {
        controller.enqueue(chunk);
        return;
      }
      chunks.push(chunk);
      html += bytesToLatin1(chunk);
      const finished = scanHead(html, scan);
      if (!finished && html.length <= maxBufferedHead) {
        return;
      }
      buffering = false;
      const buffered = concatUint8Array(chunks);
      controller.enqueue(
        finished ? spliceMetadata(buffered, scan.spans) : buffered,
      );
      chunks.length = 0;
      html = '';
    },
    flush(controller) {
      if (buffering && chunks.length) {
        controller.enqueue(concatUint8Array(chunks));
      }
    },
  });
};
