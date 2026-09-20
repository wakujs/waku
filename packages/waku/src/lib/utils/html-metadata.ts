const SCALAR_OG_PROPERTIES = new Set([
  'og:title',
  'og:type',
  'og:url',
  'og:description',
  'og:determiner',
  'og:site_name',
  'og:locale',
]);

const getAttribute = (tag: string, name: string): string | undefined => {
  const attribute =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = attribute.exec(tag))) {
    if (match[1]!.toLowerCase() === name) {
      return match[2] ?? match[3] ?? match[4] ?? '';
    }
  }
  return undefined;
};

const findTagEnd = (html: string, from: number): number => {
  let quote = '';
  for (let i = from; i < html.length; i++) {
    const char = html[i]!;
    if (quote) {
      if (char === quote) {
        quote = '';
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return i;
    }
  }
  return -1;
};

const findClosingTag = (html: string, from: number, name: string): number => {
  for (let i = from; (i = html.indexOf('<', i)) !== -1; i++) {
    if (html[i + 1] !== '/') {
      continue;
    }
    const nameEnd = i + 2 + name.length;
    if (html.slice(i + 2, nameEnd).toLowerCase() !== name) {
      continue;
    }
    const after = html[nameEnd];
    if (after !== undefined && !/[\s/>]/.test(after)) {
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

const scanHead = (
  html: string,
): { tags: MetadataTag[]; headEnd: number | undefined } => {
  const tags: MetadataTag[] = [];
  let templateDepth = 0;
  let i = 0;
  while (i < html.length) {
    const start = html.indexOf('<', i);
    if (start === -1) {
      break;
    }
    if (html.startsWith('<!--', start)) {
      const commentEnd = html.indexOf('-->', start + 4);
      if (commentEnd === -1) {
        break;
      }
      i = commentEnd + 3;
      continue;
    }
    let cursor = start + 1;
    const isClosing = html[cursor] === '/';
    if (isClosing) {
      cursor++;
    }
    const nameStart = cursor;
    while (cursor < html.length && /[a-zA-Z0-9-]/.test(html[cursor]!)) {
      cursor++;
    }
    const name = html.slice(nameStart, cursor).toLowerCase();
    if (!name) {
      i = start + 1;
      continue;
    }
    const tagEnd = findTagEnd(html, cursor);
    if (tagEnd === -1) {
      break;
    }
    if (isClosing) {
      if (name === 'template' && templateDepth > 0) {
        templateDepth--;
      } else if (name === 'head' && templateDepth === 0) {
        return { tags, headEnd: start };
      }
      i = tagEnd + 1;
      continue;
    }
    if (name === 'template') {
      templateDepth++;
      i = tagEnd + 1;
      continue;
    }
    if (
      name === 'script' ||
      name === 'style' ||
      name === 'noscript' ||
      name === 'title'
    ) {
      const contentEnd = findClosingTag(html, tagEnd + 1, name);
      if (contentEnd === -1) {
        break;
      }
      if (name === 'title' && templateDepth === 0) {
        const key = metadataKey(name, html.slice(start, tagEnd + 1));
        if (key !== undefined) {
          tags.push({ key, start, end: contentEnd });
        }
      }
      i = contentEnd;
      continue;
    }
    if (name === 'meta' && templateDepth === 0) {
      const key = metadataKey(name, html.slice(start, tagEnd + 1));
      if (key !== undefined) {
        tags.push({ key, start, end: tagEnd + 1 });
      }
    }
    i = tagEnd + 1;
  }
  return { tags, headEnd: undefined };
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
  const { tags } = scanHead(head);
  return rewriteMetadata(head, tags);
};

const MAX_BUFFERED_HEAD = 1024 * 1024;

const HEAD_END_PROBE = '</head';

const includesHeadEndProbe = (bytes: Uint8Array): boolean => {
  outer: for (let i = 0; i + HEAD_END_PROBE.length <= bytes.length; i++) {
    for (let j = 0; j < HEAD_END_PROBE.length; j++) {
      const byte = bytes[i + j]!;
      const lowered = byte >= 0x41 && byte <= 0x5a ? byte + 0x20 : byte;
      if (lowered !== HEAD_END_PROBE.charCodeAt(j)) {
        continue outer;
      }
    }
    return true;
  }
  return false;
};

const concat = (chunks: readonly Uint8Array[], length: number): Uint8Array => {
  if (chunks.length === 1) {
    return chunks[0]!;
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
};

export const dedupeHtmlMetadataStream = (): TransformStream<
  Uint8Array,
  Uint8Array
> => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffered: Uint8Array[] | undefined = [];
  let bufferedLength = 0;
  let probeTail = new Uint8Array(0);
  let probeMatched = false;

  const passThrough = (
    controller: TransformStreamDefaultController<Uint8Array>,
  ): void => {
    if (buffered?.length) {
      controller.enqueue(concat(buffered, bufferedLength));
    }
    buffered = undefined;
  };

  return new TransformStream({
    transform(chunk, controller) {
      if (!buffered) {
        controller.enqueue(chunk);
        return;
      }
      buffered.push(chunk);
      bufferedLength += chunk.byteLength;
      if (!probeMatched) {
        const probe = concat(
          [probeTail, chunk],
          probeTail.byteLength + chunk.byteLength,
        );
        probeTail = probe.slice(
          Math.max(0, probe.byteLength - HEAD_END_PROBE.length + 1),
        );
        // The probe can complete a chunk before the tag does, so once it has
        // matched every later chunk is scanned until the head is found.
        probeMatched = includesHeadEndProbe(probe);
        if (!probeMatched) {
          if (bufferedLength > MAX_BUFFERED_HEAD) {
            passThrough(controller);
          }
          return;
        }
      }
      const all = concat(buffered, bufferedLength);
      buffered = [all];
      const html = decoder.decode(all);
      const { tags, headEnd } = scanHead(html);
      if (headEnd === undefined) {
        if (bufferedLength > MAX_BUFFERED_HEAD) {
          passThrough(controller);
        }
        return;
      }
      buffered = undefined;
      const head = html.slice(0, headEnd);
      controller.enqueue(encoder.encode(rewriteMetadata(head, tags)));
      controller.enqueue(all.subarray(encoder.encode(head).length));
    },
    flush(controller) {
      passThrough(controller);
    },
  });
};
