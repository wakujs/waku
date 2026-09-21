import { concatUint8Array } from './stream.js';

/**
 * Metadata keys to merge, each resolved to its last declaration. Only keys
 * whose consumers resolve the first occurrence belong here: React appends on
 * hydration whatever the served HTML omits, which inverts any other key.
 */
export type MetadataFilter = {
  metaNames: readonly string[];
  metaProperties: readonly string[];
};

export const DEFAULT_METADATA_FILTER: MetadataFilter = {
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

/** A `<title>` inside one of these belongs to it, not to the document. */
const NESTED_CONTENT = new Set(['svg', 'template']);

/** Their content is text, so the scan reads past it rather than into it. */
const RAW_TEXT_ELEMENTS = new Set(['noscript', 'script', 'style', 'title']);

const SLASH = 47;
const GT = 62;
const EQUALS = 61;
const DOUBLE_QUOTE = 34;
const SINGLE_QUOTE = 39;

const isSpace = (code: number): boolean =>
  code === 32 || code === 9 || code === 10 || code === 12 || code === 13;

const isNameChar = (code: number): boolean =>
  (code >= 97 && code <= 122) || // a-z
  (code >= 65 && code <= 90) || // A-Z
  (code >= 48 && code <= 57) || // 0-9
  code === 45; // -

const endsAttributeName = (code: number): boolean =>
  isSpace(code) || code === EQUALS || code === GT || code === SLASH;

const endsBareValue = (code: number): boolean => isSpace(code) || code === GT;

const endsRawTextName = (code: number): boolean =>
  isSpace(code) || code === SLASH || code === GT;

type Tag = {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  /** The index just past the `>`. */
  end: number;
  attributes: Map<string, string>;
};

/** Reads the tag at `start`, or `undefined` if the buffer stops inside it. */
const readTag = (html: string, start: number): Tag | undefined => {
  let cursor = start + 1;
  const closing = html.charCodeAt(cursor) === SLASH;
  if (closing) {
    cursor++;
  }
  const nameStart = cursor;
  while (cursor < html.length && isNameChar(html.charCodeAt(cursor))) {
    cursor++;
  }
  const name = html.slice(nameStart, cursor).toLowerCase();
  const attributes = new Map<string, string>();
  let selfClosing = false;
  while (cursor < html.length) {
    const code = html.charCodeAt(cursor);
    if (isSpace(code)) {
      cursor++;
      continue;
    }
    if (code === GT) {
      return { name, closing, selfClosing, end: cursor + 1, attributes };
    }
    if (code === SLASH) {
      selfClosing = true;
      cursor++;
      continue;
    }
    selfClosing = false;
    const attributeStart = cursor;
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
    if (nameEnd >= html.length) {
      return -1;
    }
    // Anything else after the name leaves the sequence part of the text.
    if (
      html.slice(cursor + 2, nameEnd).toLowerCase() === name &&
      endsRawTextName(html.charCodeAt(nameEnd))
    ) {
      const tag = readTag(html, cursor);
      return tag === undefined ? -1 : tag.end;
    }
    cursor += 2;
  }
  return -1;
};

/**
 * Where a parser ends a `<script>`. Inside `<!-- -->` a nested `<script` makes
 * the next `</script>` part of the text rather than the end of the element.
 */
const findScriptEnd = (html: string, from: number): number => {
  let cursor = from;
  let commented = false;
  let nested = false;
  while (true) {
    const open = html.indexOf('<', cursor);
    const uncomment = commented ? html.indexOf('-->', cursor) : -1;
    if (uncomment !== -1 && (open === -1 || uncomment < open)) {
      commented = false;
      nested = false;
      cursor = uncomment + 3;
      continue;
    }
    if (open === -1) {
      return -1;
    }
    if (html.startsWith('<!--', open)) {
      commented = true;
      cursor = open + 4;
      continue;
    }
    const closing = html.charCodeAt(open + 1) === SLASH;
    const nameStart = open + (closing ? 2 : 1);
    const nameEnd = nameStart + 'script'.length;
    if (nameEnd >= html.length) {
      return -1;
    }
    if (
      html.slice(nameStart, nameEnd).toLowerCase() !== 'script' ||
      !endsRawTextName(html.charCodeAt(nameEnd))
    ) {
      cursor = open + 1;
      continue;
    }
    if (!closing) {
      nested = commented;
    } else if (nested) {
      nested = false;
    } else {
      const tag = readTag(html, open);
      return tag === undefined ? -1 : tag.end;
    }
    cursor = nameEnd;
  }
};

const readMetadataKey = (
  tag: Tag,
  filter: MetadataFilter,
): string | undefined => {
  if (tag.attributes.has('itemprop')) {
    return undefined;
  }
  if (tag.name === 'title') {
    return 'title';
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

type MetadataTag = { key: string; start: number; end: number };

/**
 * A scan in progress. `cursor` stops before anything the buffer has not
 * finished, so a scan of a longer prefix of the same document resumes from it.
 */
type HeadScan = {
  cursor: number;
  skipName: string | undefined;
  skipDepth: number;
  tags: MetadataTag[];
  headClosed: boolean;
  filter: MetadataFilter;
};

const createHeadScan = (filter: MetadataFilter): HeadScan => ({
  cursor: 0,
  skipName: undefined,
  skipDepth: 0,
  tags: [],
  headClosed: false,
  filter: {
    metaNames: filter.metaNames.map((name) => name.toLowerCase()),
    metaProperties: filter.metaProperties.map((name) => name.toLowerCase()),
  },
});

const scanHead = (html: string, scan: HeadScan): void => {
  while (!scan.headClosed) {
    const start = html.indexOf('<', scan.cursor);
    if (start === -1) {
      scan.cursor = html.length;
      return;
    }
    if (html.startsWith('<!', start)) {
      // `<!-->` is an empty comment, so its terminator can overlap its opener.
      const terminator = html.startsWith('<!--', start) ? '-->' : '>';
      const end = html.indexOf(terminator, start + 2);
      if (end === -1) {
        scan.cursor = start;
        return;
      }
      scan.cursor = end + terminator.length;
      continue;
    }
    const tag = readTag(html, start);
    if (tag === undefined) {
      scan.cursor = start;
      return;
    }
    if (!tag.name) {
      scan.cursor = start + 1;
      continue;
    }
    if (!tag.closing && RAW_TEXT_ELEMENTS.has(tag.name)) {
      // Nothing skipped is metadata, so honouring `/>` here only has to keep
      // foreign content, where it does close a tag, from waiting forever.
      if (tag.selfClosing && scan.skipName !== undefined) {
        scan.cursor = tag.end;
        continue;
      }
      const contentEnd =
        tag.name === 'script'
          ? findScriptEnd(html, tag.end)
          : findRawTextEnd(html, tag.end, tag.name);
      if (contentEnd === -1) {
        scan.cursor = start;
        return;
      }
      if (tag.name === 'title' && scan.skipName === undefined) {
        const key = readMetadataKey(tag, scan.filter);
        if (key !== undefined) {
          scan.tags.push({ key, start, end: contentEnd });
        }
      }
      scan.cursor = contentEnd;
      continue;
    }
    if (scan.skipName !== undefined) {
      if (tag.name === scan.skipName) {
        if (tag.closing) {
          scan.skipDepth--;
          if (scan.skipDepth === 0) {
            scan.skipName = undefined;
          }
        } else if (!tag.selfClosing) {
          scan.skipDepth++;
        }
      }
    } else if (tag.closing) {
      if (tag.name === 'head') {
        scan.headClosed = true;
        return;
      }
    } else {
      if (tag.name === 'meta') {
        const key = readMetadataKey(tag, scan.filter);
        if (key !== undefined) {
          scan.tags.push({ key, start, end: tag.end });
        }
      }
      if (!tag.selfClosing && NESTED_CONTENT.has(tag.name)) {
        scan.skipName = tag.name;
        scan.skipDepth = 1;
      }
    }
    scan.cursor = tag.end;
  }
};

const findSuperseded = (tags: readonly MetadataTag[]): MetadataTag[] => {
  const survivorByKey = new Map<string, number>();
  for (const tag of tags) {
    survivorByKey.set(tag.key, tag.start);
  }
  return tags.filter((tag) => survivorByKey.get(tag.key) !== tag.start);
};

const rewriteMetadata = (
  head: string,
  tags: readonly MetadataTag[],
): string => {
  let result = '';
  let cursor = 0;
  for (const tag of findSuperseded(tags)) {
    result += head.slice(cursor, tag.start);
    cursor = tag.end;
  }
  return result + head.slice(cursor);
};

const spliceMetadata = (
  buffer: Uint8Array,
  tags: readonly MetadataTag[],
): Uint8Array => {
  const dropped = findSuperseded(tags);
  if (!dropped.length) {
    return buffer;
  }
  const parts: Uint8Array[] = [];
  let cursor = 0;
  for (const tag of dropped) {
    parts.push(buffer.subarray(cursor, tag.start));
    cursor = tag.end;
  }
  parts.push(buffer.subarray(cursor));
  return concatUint8Array(parts);
};

export const dedupeHtmlMetadata = (
  head: string,
  filter: MetadataFilter = DEFAULT_METADATA_FILTER,
): string => {
  const scan = createHeadScan(filter);
  scanHead(head, scan);
  return rewriteMetadata(head, scan.tags);
};

const MAX_BUFFERED_HEAD = 1024 * 1024;

/**
 * Markup is ascii, so one character per byte is enough to scan it, and an
 * offset in the scan is then an offset in the buffer. Decoding as utf-8
 * would not: a byte it cannot decode becomes a character three bytes long.
 */
const decodeBytes = (bytes: Uint8Array): string => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return text;
};

export const dedupeHtmlMetadataStream = (
  filter: MetadataFilter = DEFAULT_METADATA_FILTER,
): TransformStream<Uint8Array, Uint8Array> => {
  const chunks: Uint8Array[] = [];
  let bufferedLength = 0;
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
      bufferedLength += chunk.byteLength;
      html += decodeBytes(chunk);
      scanHead(html, scan);
      if (!scan.headClosed) {
        if (bufferedLength > MAX_BUFFERED_HEAD) {
          buffering = false;
          controller.enqueue(concatUint8Array(chunks));
          chunks.length = 0;
        }
        return;
      }
      buffering = false;
      controller.enqueue(spliceMetadata(concatUint8Array(chunks), scan.tags));
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
