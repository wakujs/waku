import { concatUint8Array } from './stream.js';

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

const ELEMENTS_OWNING_THEIR_CONTENT = new Set(['svg', 'template']);

const RAW_TEXT_ELEMENTS = new Set(['noscript', 'script', 'style', 'title']);

const SLASH = 47;
const HYPHEN = 45;
const GT = 62;
const EQUALS = 61;
const DOUBLE_QUOTE = 34;
const SINGLE_QUOTE = 39;

const isSpace = (code: number): boolean =>
  code === 32 || code === 9 || code === 10 || code === 12 || code === 13;

const isLetter = (code: number): boolean =>
  (code >= 97 && code <= 122) || (code >= 65 && code <= 90);

const isDigit = (code: number): boolean => code >= 48 && code <= 57;

const isNameChar = (code: number): boolean =>
  isLetter(code) || isDigit(code) || code === HYPHEN;

const endsAttributeName = (code: number): boolean =>
  isSpace(code) || code === EQUALS || code === GT || code === SLASH;

const endsBareValue = (code: number): boolean => isSpace(code) || code === GT;

const endsRawTextName = (code: number): boolean =>
  isSpace(code) || code === SLASH || code === GT;

type Tag = {
  name: string;
  closing: boolean;
  selfClosing: boolean;
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

const findScriptEnd = (html: string, from: number): number => {
  let cursor = from;
  let escaped = false;
  let doubleEscaped = false;
  while (true) {
    const open = html.indexOf('<', cursor);
    const unescape = escaped ? html.indexOf('-->', cursor) : -1;
    if (unescape !== -1 && (open === -1 || unescape < open)) {
      escaped = false;
      doubleEscaped = false;
      cursor = unescape + 3;
      continue;
    }
    if (open === -1) {
      return -1;
    }
    if (html.startsWith('<!--', open)) {
      escaped = true;
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
      doubleEscaped = escaped;
    } else if (doubleEscaped) {
      doubleEscaped = false;
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

type HeadScan = {
  resumeAt: number;
  skipName: string | undefined;
  skipDepth: number;
  tags: MetadataTag[];
  headClosed: boolean;
  filter: MetadataFilter;
};

const createHeadScan = (filter: Partial<MetadataFilter>): HeadScan => ({
  resumeAt: 0,
  skipName: undefined,
  skipDepth: 0,
  tags: [],
  headClosed: false,
  filter: {
    metaNames: (filter.metaNames ?? DEFAULT_METADATA_FILTER.metaNames).map(
      (name) => name.toLowerCase(),
    ),
    metaProperties: (
      filter.metaProperties ?? DEFAULT_METADATA_FILTER.metaProperties
    ).map((name) => name.toLowerCase()),
  },
});

const scanHead = (html: string, scan: HeadScan): void => {
  while (!scan.headClosed) {
    const start = html.indexOf('<', scan.resumeAt);
    if (start === -1) {
      scan.resumeAt = html.length;
      return;
    }
    if (html.startsWith('<!', start)) {
      const terminator = html.startsWith('<!--', start) ? '-->' : '>';
      // `<!-->` is an empty comment, so the search starts inside its opener.
      const end = html.indexOf(terminator, start + '<!'.length);
      if (end === -1) {
        scan.resumeAt = start;
        return;
      }
      scan.resumeAt = end + terminator.length;
      continue;
    }
    const tag = readTag(html, start);
    if (tag === undefined) {
      scan.resumeAt = start;
      return;
    }
    if (!tag.name) {
      scan.resumeAt = start + 1;
      continue;
    }
    if (!tag.closing && RAW_TEXT_ELEMENTS.has(tag.name)) {
      // Foreign content closes on `/>`, and nothing skipped is metadata.
      if (tag.selfClosing && scan.skipName !== undefined) {
        scan.resumeAt = tag.end;
        continue;
      }
      const contentEnd =
        tag.name === 'script'
          ? findScriptEnd(html, tag.end)
          : findRawTextEnd(html, tag.end, tag.name);
      if (contentEnd === -1) {
        scan.resumeAt = start;
        return;
      }
      if (tag.name === 'title' && scan.skipName === undefined) {
        const key = readMetadataKey(tag, scan.filter);
        if (key !== undefined) {
          scan.tags.push({ key, start, end: contentEnd });
        }
      }
      scan.resumeAt = contentEnd;
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
      if (!tag.selfClosing && ELEMENTS_OWNING_THEIR_CONTENT.has(tag.name)) {
        scan.skipName = tag.name;
        scan.skipDepth = 1;
      }
    }
    scan.resumeAt = tag.end;
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
  filter: Partial<MetadataFilter> = {},
): string => {
  const scan = createHeadScan(filter);
  scanHead(head, scan);
  return rewriteMetadata(head, scan.tags);
};

const DEFAULT_MAX_BUFFERED_HEAD = 1024 * 1024;

// Decoding utf-8 would lose the offsets the splice needs: a byte it cannot
// decode comes back as a character three bytes long.
const decodeOneCharPerByte = (bytes: Uint8Array): string => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return text;
};

export const dedupeHtmlMetadataStream = (
  filter: Partial<MetadataFilter> = {},
  maxBufferedHead = DEFAULT_MAX_BUFFERED_HEAD,
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
      html += decodeOneCharPerByte(chunk);
      scanHead(html, scan);
      if (!scan.headClosed) {
        if (bufferedLength > maxBufferedHead) {
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
