import { concatUint8Array } from './stream.js';

const SCALAR_OG_PROPERTIES = new Set([
  'og:title',
  'og:type',
  'og:url',
  'og:description',
  'og:determiner',
  'og:site_name',
  'og:locale',
]);

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'noscript', 'title']);

const ATTRIBUTE_RE =
  /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

const getAttribute = (tag: string, name: string): string | undefined => {
  ATTRIBUTE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE_RE.exec(tag))) {
    if (match[1]!.toLowerCase() === name) {
      return match[2] ?? match[3] ?? match[4] ?? '';
    }
  }
  return undefined;
};

const isNameChar = (code: number): boolean =>
  (code >= 97 && code <= 122) ||
  (code >= 65 && code <= 90) ||
  (code >= 48 && code <= 57) ||
  code === 45;

const isAfterName = (code: number): boolean =>
  code === 32 ||
  code === 9 ||
  code === 10 ||
  code === 12 ||
  code === 13 ||
  code === 47 ||
  code === 62;

const findTagEnd = (html: string, from: number): number => {
  let quote = 0;
  for (let i = from; i < html.length; i++) {
    const code = html.charCodeAt(i);
    if (quote) {
      if (code === quote) {
        quote = 0;
      }
    } else if (code === 34 || code === 39) {
      quote = code;
    } else if (code === 62) {
      return i;
    }
  }
  return -1;
};

const findRawTextEnd = (html: string, from: number, name: string): number => {
  for (let i = from; (i = html.indexOf('</', i)) !== -1; i += 2) {
    const nameEnd = i + 2 + name.length;
    if (
      nameEnd >= html.length ||
      html.slice(i + 2, nameEnd).toLowerCase() !== name ||
      !isAfterName(html.charCodeAt(nameEnd))
    ) {
      continue;
    }
    const tagEnd = findTagEnd(html, nameEnd);
    return tagEnd === -1 ? -1 : tagEnd + 1;
  }
  return -1;
};

const metadataKey = (name: string, tag: string): string | undefined => {
  if (getAttribute(tag, 'itemprop') !== undefined) {
    return undefined;
  }
  if (name === 'title') {
    return 'title';
  }
  if (getAttribute(tag, 'name')?.toLowerCase() === 'description') {
    return 'name:description';
  }
  const property = getAttribute(tag, 'property')?.toLowerCase();
  if (property !== undefined && SCALAR_OG_PROPERTIES.has(property)) {
    return 'property:' + property;
  }
  return undefined;
};

type MetadataTag = { key: string; start: number; end: number };

/**
 * A scan in progress. React hoists document metadata to be a direct child of
 * `<head>`, so `depth` -- how deep inside the head the scan is -- separates it
 * from a `<title>` belonging to an inline `<svg>`, a `<template>`, or any
 * other element written into the head.
 *
 * `cursor` stops before anything the buffer has not finished, so a scan of a
 * longer prefix of the same document resumes from it.
 */
type HeadScan = {
  cursor: number;
  depth: number;
  tags: MetadataTag[];
  headEnd: number | undefined;
};

const createHeadScan = (): HeadScan => ({
  cursor: 0,
  depth: 0,
  tags: [],
  headEnd: undefined,
});

const scanHead = (html: string, scan: HeadScan): void => {
  while (scan.headEnd === undefined) {
    const start = html.indexOf('<', scan.cursor);
    if (start === -1) {
      scan.cursor = html.length;
      return;
    }
    if (html.startsWith('<!--', start)) {
      // `<!-->` is an empty comment, so the terminator may overlap the opener.
      const commentEnd = html.indexOf('-->', start + 2);
      if (commentEnd === -1) {
        scan.cursor = start;
        return;
      }
      scan.cursor = commentEnd + 3;
      continue;
    }
    let cursor = start + 1;
    const isClosing = html.charCodeAt(cursor) === 47;
    if (isClosing) {
      cursor++;
    }
    const nameStart = cursor;
    while (cursor < html.length && isNameChar(html.charCodeAt(cursor))) {
      cursor++;
    }
    const name = html.slice(nameStart, cursor).toLowerCase();
    if (!name) {
      if (cursor >= html.length) {
        scan.cursor = start;
        return;
      }
      scan.cursor = start + 1;
      continue;
    }
    const tagEnd = findTagEnd(html, cursor);
    if (tagEnd === -1) {
      scan.cursor = start;
      return;
    }
    if (isClosing) {
      if (scan.depth > 0) {
        scan.depth--;
      } else if (name === 'head') {
        scan.headEnd = start;
        return;
      }
      scan.cursor = tagEnd + 1;
      continue;
    }
    if (RAW_TEXT_ELEMENTS.has(name)) {
      const contentEnd = findRawTextEnd(html, tagEnd + 1, name);
      if (contentEnd === -1) {
        scan.cursor = start;
        return;
      }
      if (name === 'title' && scan.depth === 0) {
        const key = metadataKey(name, html.slice(start, tagEnd + 1));
        if (key !== undefined) {
          scan.tags.push({ key, start, end: contentEnd });
        }
      }
      scan.cursor = contentEnd;
      continue;
    }
    if (VOID_ELEMENTS.has(name) || html.charCodeAt(tagEnd - 1) === 47) {
      if (name === 'meta' && scan.depth === 0) {
        const key = metadataKey(name, html.slice(start, tagEnd + 1));
        if (key !== undefined) {
          scan.tags.push({ key, start, end: tagEnd + 1 });
        }
      }
    } else if (name !== 'html' && name !== 'head') {
      scan.depth++;
    }
    scan.cursor = tagEnd + 1;
  }
};

const rewriteMetadata = (
  head: string,
  tags: readonly MetadataTag[],
): string => {
  const survivorByKey = new Map<string, number>();
  for (const tag of tags) {
    survivorByKey.set(tag.key, tag.start);
  }
  if (survivorByKey.size === tags.length) {
    return head;
  }
  let result = '';
  let cursor = 0;
  for (const tag of tags) {
    if (survivorByKey.get(tag.key) === tag.start) {
      continue;
    }
    result += head.slice(cursor, tag.start);
    cursor = tag.end;
  }
  return result + head.slice(cursor);
};

export const dedupeHtmlMetadata = (head: string): string => {
  const scan = createHeadScan();
  scanHead(head, scan);
  return rewriteMetadata(head, scan.tags);
};

const MAX_BUFFERED_HEAD = 1024 * 1024;

const utf8Length = (text: string): number => {
  let length = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      length += 1;
    } else if (code < 0x800) {
      length += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      length += 4;
      i++;
    } else {
      length += 3;
    }
  }
  return length;
};

const trailingPartialLength = (bytes: Uint8Array): number => {
  for (let back = 1; back <= 3 && back <= bytes.length; back++) {
    const byte = bytes[bytes.length - back]!;
    if ((byte & 0xc0) === 0x80) {
      continue;
    }
    const needed = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
    return needed > back ? back : 0;
  }
  return 0;
};

export const dedupeHtmlMetadataStream = (): TransformStream<
  Uint8Array,
  Uint8Array
> => {
  const encoder = new TextEncoder();
  // The head is re-encoded to find where it ends in the buffer, so the decode
  // has to keep every byte it was given.
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  const chunks: Uint8Array[] = [];
  let bufferedLength = 0;
  let partial = new Uint8Array(0);
  let html = '';
  const scan = createHeadScan();
  let buffering = true;

  return new TransformStream({
    transform(chunk, controller) {
      if (!buffering) {
        controller.enqueue(chunk);
        return;
      }
      chunks.push(chunk);
      bufferedLength += chunk.byteLength;
      const decodable = concatUint8Array([partial, chunk]);
      const trailing = trailingPartialLength(decodable);
      partial = decodable.slice(decodable.length - trailing);
      html += decoder.decode(
        decodable.subarray(0, decodable.length - trailing),
      );
      scanHead(html, scan);
      if (scan.headEnd === undefined) {
        if (bufferedLength > MAX_BUFFERED_HEAD) {
          buffering = false;
          controller.enqueue(concatUint8Array(chunks));
          chunks.length = 0;
        }
        return;
      }
      buffering = false;
      const head = html.slice(0, scan.headEnd);
      controller.enqueue(encoder.encode(rewriteMetadata(head, scan.tags)));
      controller.enqueue(concatUint8Array(chunks).subarray(utf8Length(head)));
      chunks.length = 0;
    },
    flush(controller) {
      if (buffering && chunks.length) {
        controller.enqueue(concatUint8Array(chunks));
      }
    },
  });
};
