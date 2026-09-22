import { concatUint8Array } from './stream.js';

// This is not an HTML parser. It reads the head React renders, and stops at
// anything else it finds in one -- including markup passed through by
// `dangerouslySetInnerHTML` -- so the scan then merges nothing and the
// response is served as rendered.

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

// A head of metadata and the text around it is all the scan models. Anything
// else in one, from a `<template>` to a stray `<div>`, ends it.
const ELEMENTS_THE_SCAN_READS = new Set([
  'base',
  'head',
  'html',
  'link',
  'meta',
  'script',
  'style',
  'title',
]);

const SLASH = 47;
const GT = 62;
const EQUALS = 61;
const DOUBLE_QUOTE = 34;
const SINGLE_QUOTE = 39;

const isSpace = (code: number): boolean =>
  code === 32 || code === 9 || code === 10 || code === 12 || code === 13;

const isLetter = (code: number): boolean =>
  (code >= 97 && code <= 122) || (code >= 65 && code <= 90);

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
  if (isLetter(html.charCodeAt(cursor))) {
    while (cursor < html.length && !endsTagName(html.charCodeAt(cursor))) {
      cursor++;
    }
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
  const from = start + '<!'.length;
  if (!html.startsWith('<!--', start)) {
    const end = html.indexOf('>', from);
    return end === -1 ? -1 : end + 1;
  }
  // `<!-->` closes abruptly, so that search starts inside the opener, but
  // reaching the comment end bang state takes two hyphens of its own.
  const plain = html.indexOf('-->', from);
  const bang = html.indexOf('--!>', start + '<!--'.length);
  if (plain !== -1 && (bang === -1 || plain < bang)) {
    return plain + '-->'.length;
  }
  return bang === -1 ? -1 : bang + '--!>'.length;
};

// A `</script>` ends a script unless `<!--` then `<script` has put the
// tokenizer in its double escaped state. React escapes `<script` in the script
// children it renders and the RSC payload escapes `<!--`, so that pair only
// reaches a head through `dangerouslySetInnerHTML`, which the scan stops at
// rather than model.
const SCRIPT_OPEN = /<script/i;

const entersDoubleEscape = (content: string): boolean => {
  const comment = content.indexOf('<!--');
  return comment !== -1 && SCRIPT_OPEN.test(content.slice(comment));
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
  tags: MetadataTag[];
  finished: boolean;
  filter: MetadataFilter;
};

const createHeadScan = (filter: Partial<MetadataFilter>): HeadScan => ({
  resumeAt: 0,
  tags: [],
  finished: false,
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
  while (!scan.finished) {
    const start = html.indexOf('<', scan.resumeAt);
    if (start === -1) {
      scan.resumeAt = html.length;
      return;
    }
    if (html.startsWith('<!', start)) {
      const end = findDeclarationEnd(html, start);
      if (end === -1) {
        scan.resumeAt = start;
        return;
      }
      scan.resumeAt = end;
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
    if (!tag.closing && !ELEMENTS_THE_SCAN_READS.has(tag.name)) {
      scan.tags.length = 0;
      scan.finished = true;
      return;
    }
    if (RAW_TEXT_ELEMENTS.has(tag.name) && !tag.closing) {
      const contentEnd = findRawTextEnd(html, tag.end, tag.name);
      if (contentEnd === -1) {
        scan.resumeAt = start;
        return;
      }
      if (
        tag.name === 'script' &&
        entersDoubleEscape(html.slice(tag.end, contentEnd))
      ) {
        scan.tags.length = 0;
        scan.finished = true;
        return;
      }
      if (tag.name === 'title') {
        const key = readMetadataKey(tag, scan.filter);
        if (key !== undefined) {
          scan.tags.push({ key, start, end: contentEnd });
        }
      }
      scan.resumeAt = contentEnd;
      continue;
    }
    if (tag.closing) {
      if (tag.name === 'head') {
        scan.finished = true;
        return;
      }
    } else if (tag.name === 'meta') {
      const key = readMetadataKey(tag, scan.filter);
      if (key !== undefined) {
        scan.tags.push({ key, start, end: tag.end });
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

export const dedupeHeadMetadataForTest = (
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
  for (let i = 0; i < bytes.length; i += 0x400) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x400));
  }
  return text;
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
      html += decodeOneCharPerByte(chunk);
      scanHead(html, scan);
      if (!scan.finished) {
        if (html.length > maxBufferedHead) {
          buffering = false;
          controller.enqueue(concatUint8Array(chunks));
          chunks.length = 0;
          html = '';
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
