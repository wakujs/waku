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
  '!doctype',
  'base',
  'head',
  'html',
  'link',
  'meta',
]);

// Past the end of what has arrived a character reads as undefined, which ends
// every run below, so the scan waits for the next chunk rather than running on.
type Char = string | undefined;

const isSpace = (char: Char): boolean =>
  char === ' ' ||
  char === '\t' ||
  char === '\n' ||
  char === '\f' ||
  char === '\r';

const endsTagName = (char: Char): boolean =>
  isSpace(char) || char === '/' || char === '>';

const endsAttributeName = (char: Char): boolean =>
  endsTagName(char) || char === '=';

const endsBareValue = (char: Char): boolean => isSpace(char) || char === '>';

type Tag = {
  name: string;
  closing: boolean;
  end: number;
  attributes: Map<string, string>;
};

const readTag = (html: string, start: number): Tag | undefined => {
  let cursor = start + 1;
  const closing = html[cursor] === '/';
  if (closing) {
    cursor++;
  }
  const nameStart = cursor;
  while (cursor < html.length && !endsTagName(html[cursor])) {
    cursor++;
  }
  const name = html.slice(nameStart, cursor).toLowerCase();
  const attributes = new Map<string, string>();
  while (cursor < html.length) {
    const char = html[cursor];
    if (isSpace(char)) {
      cursor++;
      continue;
    }
    if (char === '>') {
      return { name, closing, end: cursor + 1, attributes };
    }
    if (char === '/') {
      cursor++;
      continue;
    }
    // An `=` in the name position starts an attribute name rather than
    // ending an empty one, so the first character is always part of it.
    const attributeStart = cursor;
    cursor++;
    while (cursor < html.length && !endsAttributeName(html[cursor])) {
      cursor++;
    }
    const attribute = html.slice(attributeStart, cursor).toLowerCase();
    while (cursor < html.length && isSpace(html[cursor])) {
      cursor++;
    }
    if (html[cursor] !== '=') {
      if (!attributes.has(attribute)) {
        attributes.set(attribute, '');
      }
      continue;
    }
    cursor++;
    while (cursor < html.length && isSpace(html[cursor])) {
      cursor++;
    }
    const quote = html[cursor];
    const quoted = quote === '"' || quote === "'";
    if (quoted) {
      cursor++;
    }
    const valueStart = cursor;
    while (
      cursor < html.length &&
      (quoted ? html[cursor] !== quote : !endsBareValue(html[cursor]))
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
      endsTagName(html[nameEnd])
    ) {
      const tag = readTag(html, cursor);
      return tag === undefined ? -1 : tag.end;
    }
    cursor += 2;
  }
  return -1;
};

// `<!--` then `<script` puts the tokenizer in its double escaped state, where
// the next `</script>` does not close the element.
const SCRIPT_OPEN_REGEXP = /<script/i;

const entersDoubleEscape = (content: string): boolean =>
  content.includes('<!--') && SCRIPT_OPEN_REGEXP.test(content);

// What a tag in a head names itself with. A `<meta>` carrying two of them,
// or a `<title>` carrying any, holds an identity besides the one the splice
// would place: dropping the tag would take that identity's value out of the
// document, and keeping it would shadow whatever supersedes the other.
const NAMING_ATTRIBUTES = [
  'charset',
  'http-equiv',
  'itemprop',
  'name',
  'property',
];

const namesItselfTwice = (tag: Tag): boolean => {
  const names = NAMING_ATTRIBUTES.filter((attribute) =>
    tag.attributes.has(attribute),
  ).length;
  return tag.name === 'title' ? names > 0 : names > 1;
};

// React leaves out an attribute whose value is undefined but renders an empty
// `<title>` whatever its children were, so a `<meta>` without `content`
// declared nothing while a title always declares what it holds.
const declaresValue = (tag: Tag): boolean =>
  tag.name === 'title' || tag.attributes.has('content');

const readMetadataKey = (
  tag: Tag,
  filter: MetadataFilter,
): string | undefined => {
  if (tag.name === 'title') {
    return 'title';
  }
  if (tag.name !== 'meta') {
    return undefined;
  }
  const name = tag.attributes.get('name')?.toLowerCase();
  if (name !== undefined && filter.metaNames.includes(name)) {
    return 'name:' + name;
  }
  const property = tag.attributes.get('property')?.toLowerCase();
  if (property !== undefined && filter.metaProperties.includes(property)) {
    return 'property:' + property;
  }
  return undefined;
};

const encoder = new TextEncoder();

// The splice cuts the head at offsets this string yields, so a byte has to
// stay one character: utf-8 would collapse a multi-byte sequence into one.
const bytesToLatin1 = (bytes: Uint8Array): string => {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return text;
};

const latin1ToBytes = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i);
  }
  return bytes;
};

type MetadataSpan = {
  key: string;
  declaresValue: boolean;
  start: number;
  end: number;
};

type HeadScan = {
  resumeAt: number;
  spans: MetadataSpan[];
  filter: MetadataFilter;
};

// The scan reads a name out of latin1-decoded bytes, so a filter entry is
// read the same way rather than as the string a config file spelled.
const asScanned = (name: string): string =>
  bytesToLatin1(encoder.encode(name)).toLowerCase();

const createHeadScan = (filter: Partial<MetadataFilter>): HeadScan => ({
  resumeAt: 0,
  spans: [],
  filter: {
    metaNames: (filter.metaNames ?? DEFAULT_METADATA_FILTER.metaNames).map(
      asScanned,
    ),
    metaProperties: (
      filter.metaProperties ?? DEFAULT_METADATA_FILTER.metaProperties
    ).map(asScanned),
  },
});

const scanHead = (html: string, scan: HeadScan): boolean => {
  while (true) {
    const start = html.indexOf('<', scan.resumeAt);
    if (start === -1) {
      scan.resumeAt = html.length;
      return false;
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
    const key = readMetadataKey(tag, scan.filter);
    if (key !== undefined) {
      if (namesItselfTwice(tag)) {
        scan.spans.length = 0;
        return true;
      }
      scan.spans.push({ key, declaresValue: declaresValue(tag), start, end });
    }
    scan.resumeAt = end;
  }
};

// A tag that declared nothing is superseded by one that did, wherever it sits,
// and supersedes none itself: dropping the last tag to declare a name would
// take that name out of the document.
const findSuperseded = (spans: readonly MetadataSpan[]): MetadataSpan[] => {
  const lastStartByKey = new Map<string, number>();
  for (const span of spans) {
    if (span.declaresValue) {
      lastStartByKey.set(span.key, span.start);
    }
  }
  return spans.filter((span) => {
    const lastStart = lastStartByKey.get(span.key);
    return lastStart !== undefined && lastStart !== span.start;
  });
};

const spliceMetadata = (
  head: string,
  spans: readonly MetadataSpan[],
): string => {
  let merged = '';
  let cursor = 0;
  for (const span of findSuperseded(spans)) {
    merged += head.slice(cursor, span.start);
    cursor = span.end;
  }
  return merged + head.slice(cursor);
};

const DEFAULT_MAX_BUFFERED_HEAD = 1024 * 1024;

export const dedupeHeadMetadataForTest = (
  head: string,
  filter: Partial<MetadataFilter> = {},
): string => {
  const latin1 = bytesToLatin1(encoder.encode(head));
  const scan = createHeadScan(filter);
  const merged = scanHead(latin1, scan)
    ? spliceMetadata(latin1, scan.spans)
    : latin1;
  return new TextDecoder().decode(latin1ToBytes(merged));
};

export const dedupeHtmlMetadataStream = (
  filter: Partial<MetadataFilter> = {},
  maxBufferedHead = DEFAULT_MAX_BUFFERED_HEAD,
): TransformStream<Uint8Array, Uint8Array> => {
  let html = '';
  const scan = createHeadScan(filter);
  let buffering = true;

  return new TransformStream({
    transform(chunk, controller) {
      if (!buffering) {
        controller.enqueue(chunk);
        return;
      }
      html += bytesToLatin1(chunk);
      const finished = scanHead(html, scan);
      if (!finished && html.length <= maxBufferedHead) {
        return;
      }
      buffering = false;
      controller.enqueue(
        latin1ToBytes(finished ? spliceMetadata(html, scan.spans) : html),
      );
      html = '';
    },
    flush(controller) {
      if (buffering && html) {
        controller.enqueue(latin1ToBytes(html));
      }
    },
  });
};
