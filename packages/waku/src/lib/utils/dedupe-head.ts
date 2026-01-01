type HeadTag = {
  start: number;
  end: number;
  identity: string;
  html: string;
};

export const parseAttributes = (html: string) => {
  const attrs: Record<string, string> = {};
  for (const [, k, v] of html.matchAll(/(\S+?)=("[^"]*"|'[^']*'|[^\s>]+)/g)) {
    attrs[k!.toLowerCase()] = v!.replace(/^["']|["']$/g, '');
  }
  return attrs;
};

const getMetaIdentity = (attrs: Record<string, string>) => {
  if ('charset' in attrs) return 'meta:charset';
  if (attrs['name']) return `meta:name:${attrs['name'].toLowerCase()}`;
  if (attrs['property']) return `meta:property:${attrs['property'].toLowerCase()}`;
  if (attrs['http-equiv']) return `meta:http-equiv:${attrs['http-equiv'].toLowerCase()}`;
  if (attrs['itemprop']) return `meta:itemprop:${attrs['itemprop'].toLowerCase()}`;
  return '';
};

const getLinkIdentity = (attrs: Record<string, string>) => {
  const rel = attrs['rel']?.toLowerCase() ?? '';
  if (!rel) return '';
  return `link:rel:${rel}|href:${attrs['href'] ?? ''}`;
};

const findTagEnd = (html: string, start: number, tagName: string) => {
  const lower = html.toLowerCase();
  const selfClose = html.indexOf('/>', start);
  const close = html.indexOf('>', start);

  if (selfClose !== -1 && selfClose < close + 1) {
    if (!html.slice(start, selfClose).trim().includes('>')) {
      return selfClose + 2;
    }
  }
  if (close === -1) return -1;
  if (tagName === 'title') {
    const end = lower.indexOf('</title>', close);
    return end === -1 ? -1 : end + 8;
  }
  return close + 1;
};

const extractHeadTags = (content: string): HeadTag[] => {
  const tags: HeadTag[] = [];
  const lower = content.toLowerCase();
  const patterns = ['<title', '<meta', '<link'];
  let pos = 0;

  while (pos < content.length) {
    let idx = -1;
    let tagName = '';

    for (const p of patterns) {
      const i = lower.indexOf(p, pos);
      if (i !== -1 && (idx === -1 || i < idx)) {
        const next = lower[i + p.length];
        if (next && ' >/\t\n\r'.includes(next)) {
          idx = i;
          tagName = p.slice(1);
        }
      }
    }

    if (idx === -1) break;

    const end = findTagEnd(content, idx, tagName);
    if (end === -1) {
      pos = idx + 1;
      continue;
    }

    const html = content.slice(idx, end);
    const attrs = parseAttributes(html);
    const identity =
      tagName === 'title'
        ? 'title'
        : tagName === 'meta'
          ? getMetaIdentity(attrs)
          : getLinkIdentity(attrs);

    tags.push({ start: idx, end, identity, html });
    pos = end;
  }

  return tags;
};

export const dedupeHead = (head: string) => {
  const lower = head.toLowerCase();

  const openStart = lower.indexOf('<head');
  if (openStart === -1) return head;

  const openEnd = head.indexOf('>', openStart);
  if (openEnd === -1) return head;
  
  const closeStart = lower.indexOf('</head>');
  if (closeStart === -1) return head;

  const content = head.slice(openEnd + 1, closeStart);
  const tags = extractHeadTags(content);
  if (!tags.length) return head;

  const latest = new Map<string, number>();
  tags.forEach((t, i) => t.identity && latest.set(t.identity, i));

  let result = head.slice(openStart, openEnd + 1);
  let lastEnd = 0;

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i]!;
    const keep = !tag.identity || latest.get(tag.identity) === i;
    let between = content.slice(lastEnd, tag.start);
    if (!keep) between = between.replace(/[\t ]*\n[\t ]*$/, '');
    result += between;
    if (keep) result += tag.html;
    lastEnd = tag.end;
  }

  result += content.slice(lastEnd);
  result += '</head>';
  return result;
};

export const dedupeHeadTags = (): TransformStream<Uint8Array, Uint8Array> => {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let seenOpen = false;
  let closed = false;
  let prefix = '';
  let pending = '';

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      if (closed) {
        controller.enqueue(encoder.encode(buffer));
        buffer = '';
        return;
      }

      if (!seenOpen) {
        const idx = buffer.toLowerCase().indexOf('<head');
        if (idx === -1) {
          if (buffer.length > 4) {
            controller.enqueue(encoder.encode(buffer.slice(0, -4)));
            buffer = buffer.slice(-4);
          }
          return;
        }
        prefix += buffer.slice(0, idx);
        buffer = buffer.slice(idx);
        seenOpen = true;
      }

      const closeIdx = buffer.toLowerCase().indexOf('</head>');
      if (closeIdx === -1) {
        pending += buffer;
        buffer = '';
        return;
      }

      pending += buffer.slice(0, closeIdx + 7);
      const suffix = buffer.slice(closeIdx + 7);
      buffer = '';

      if (prefix) controller.enqueue(encoder.encode(prefix));
      controller.enqueue(encoder.encode(dedupeHead(pending)));
      if (suffix) controller.enqueue(encoder.encode(suffix));

      prefix = '';
      pending = '';
      closed = true;
    },
    flush(controller) {
      if (!closed && seenOpen && pending) {
        controller.enqueue(encoder.encode(prefix + pending + buffer));
      } else if (buffer) {
        controller.enqueue(encoder.encode(buffer));
      }
    },
  });
};
