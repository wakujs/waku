import { describe, expect, test } from 'vitest';
import {
  dedupeHtmlMetadata,
  dedupeHtmlMetadataStream,
} from '../src/lib/utils/html-metadata.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

const pipeBytes = async (chunks: readonly Uint8Array[]): Promise<string> => {
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  const out: Uint8Array[] = [];
  const reader = input.pipeThrough(dedupeHtmlMetadataStream()).getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    out.push(value);
  }
  const total = out.reduce((n, chunk) => n + chunk.byteLength, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of out) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return dec.decode(joined);
};

const pipe = (chunks: readonly string[]): Promise<string> =>
  pipeBytes(chunks.map((chunk) => enc.encode(chunk)));

describe('dedupeHtmlMetadata', () => {
  test('keeps the last title', () => {
    expect(dedupeHtmlMetadata('<title>layout</title><title>page</title>')).toBe(
      '<title>page</title>',
    );
  });

  test('keeps the last description and og tag', () => {
    const head =
      '<meta name="description" content="layout"/>' +
      '<meta property="og:title" content="layout"/>' +
      '<meta name="description" content="page"/>' +
      '<meta property="og:title" content="page"/>';
    expect(dedupeHtmlMetadata(head)).toBe(
      '<meta name="description" content="page"/>' +
        '<meta property="og:title" content="page"/>',
    );
  });

  test('deduplicates each scalar og property independently', () => {
    const head =
      '<meta property="og:title" content="a"/>' +
      '<meta property="og:site_name" content="b"/>' +
      '<meta property="og:title" content="c"/>';
    expect(dedupeHtmlMetadata(head)).toBe(
      '<meta property="og:site_name" content="b"/>' +
        '<meta property="og:title" content="c"/>',
    );
  });

  test('keeps repeated og properties that represent arrays', () => {
    const head =
      '<meta property="og:image" content="hero.jpg"/>' +
      '<meta property="og:image:width" content="800"/>' +
      '<meta property="og:image" content="thumb.jpg"/>' +
      '<meta property="og:video" content="a.mp4"/>' +
      '<meta property="og:video" content="b.mp4"/>' +
      '<meta property="og:locale:alternate" content="fr_FR"/>' +
      '<meta property="og:locale:alternate" content="de_DE"/>';
    expect(dedupeHtmlMetadata(head)).toBe(head);
  });

  test('leaves raw text in script and style untouched', () => {
    const head =
      '<title>layout</title>' +
      '<script>const h = "<title>example</title>";</script>' +
      '<style>/* <meta name="description" content="x"> */</style>' +
      '<title>page</title>';
    expect(dedupeHtmlMetadata(head)).toBe(
      '<script>const h = "<title>example</title>";</script>' +
        '<style>/* <meta name="description" content="x"> */</style>' +
        '<title>page</title>',
    );
  });

  test('ignores metadata inside template and resumes after it', () => {
    expect(
      dedupeHtmlMetadata(
        '<title>a</title><template><title>t</title></template><title>b</title>',
      ),
    ).toBe('<template><title>t</title></template><title>b</title>');
  });

  test('ignores metadata inside nested templates', () => {
    expect(
      dedupeHtmlMetadata(
        '<title>a</title>' +
          '<template><template><title>x</title></template>' +
          '<title>y</title></template>' +
          '<title>b</title>',
      ),
    ).toBe(
      '<template><template><title>x</title></template>' +
        '<title>y</title></template>' +
        '<title>b</title>',
    );
  });

  test('ignores a `</template>` written inside a comment or script', () => {
    expect(
      dedupeHtmlMetadata(
        '<title>a</title>' +
          '<template><!-- </template> -->' +
          '<script>var s = "</template>";</script>' +
          '<title>t</title></template>' +
          '<title>b</title>',
      ),
    ).toBe(
      '<template><!-- </template> -->' +
        '<script>var s = "</template>";</script>' +
        '<title>t</title></template>' +
        '<title>b</title>',
    );
  });

  test('does not let a commented `<template>` suppress the rest of the head', () => {
    expect(
      dedupeHtmlMetadata(
        '<title>a</title><template><!-- <template> --></template><title>b</title>',
      ),
    ).toBe('<template><!-- <template> --></template><title>b</title>');
  });

  test('treats a self-closing template as open, as the parser does', () => {
    const head =
      '<title>a</title><template/>' +
      '<meta name="description" content="x"/>' +
      '<meta name="description" content="y"/>';
    expect(dedupeHtmlMetadata(head)).toBe(head);
  });

  test('does not merge metadata across noscript', () => {
    expect(
      dedupeHtmlMetadata(
        '<meta name="description" content="a"/>' +
          '<noscript><meta name="description" content="no-js"/></noscript>' +
          '<meta name="description" content="b"/>',
      ),
    ).toBe(
      '<noscript><meta name="description" content="no-js"/></noscript>' +
        '<meta name="description" content="b"/>',
    );
  });

  test('ignores a `</noscript>` written inside its raw text', () => {
    expect(
      dedupeHtmlMetadata(
        '<title>a</title>' +
          '<noscript><style>i::after{content:"</noscript>"}</style></noscript>' +
          '<title>b</title>',
      ),
    ).toBe(
      '<noscript><style>i::after{content:"</noscript>"}</style></noscript>' +
        '<title>b</title>',
    );
  });

  test('ignores tags inside comments', () => {
    const head =
      '<title>layout</title>' +
      '<!-- <title>commented</title> -->' +
      '<title>page</title>';
    expect(dedupeHtmlMetadata(head)).toBe(
      '<!-- <title>commented</title> --><title>page</title>',
    );
  });

  test('deduplicates a title carrying attributes', () => {
    expect(
      dedupeHtmlMetadata('<title>Layout</title><title lang="en">Page</title>'),
    ).toBe('<title lang="en">Page</title>');
  });

  test('leaves an itemProp title alone', () => {
    const head = '<title>Layout</title><title itemProp="name">Item</title>';
    expect(dedupeHtmlMetadata(head)).toBe(head);
  });

  test('matches metadata names case-insensitively', () => {
    expect(
      dedupeHtmlMetadata(
        '<meta name="description" content="layout"/>' +
          '<meta name="Description" content="page"/>',
      ),
    ).toBe('<meta name="Description" content="page"/>');
  });

  test('leaves tags outside the allowlist untouched', () => {
    const head =
      '<meta charSet="utf-8"/>' +
      '<meta name="viewport" content="width=device-width"/>' +
      '<meta name="generator" content="Waku"/>' +
      '<meta name="viewport" content="width=400"/>' +
      '<meta name="generator" content="App"/>';
    expect(dedupeHtmlMetadata(head)).toBe(head);
  });

  test('matches tag boundaries around escaped angle brackets', () => {
    // React escapes `<`, `>`, `&` and `"` in text and attribute values alike,
    // so a tag ends at the first `>` and title text at the first `<`.
    const head =
      '<head><meta charSet="utf-8"/><title>a &gt; b</title>' +
      '<link rel="stylesheet" href="/a.css"/>' +
      '<title>c &quot;d&quot;</title></head>';
    expect(dedupeHtmlMetadata(head)).toBe(
      '<head><meta charSet="utf-8"/>' +
        '<link rel="stylesheet" href="/a.css"/>' +
        '<title>c &quot;d&quot;</title></head>',
    );
  });

  test('returns the input unchanged when there is nothing to remove', () => {
    const head = '<title>only</title><meta name="description" content="one"/>';
    expect(dedupeHtmlMetadata(head)).toBe(head);
  });
});

describe('dedupeHtmlMetadataStream', () => {
  test('rewrites the head and passes the body through', async () => {
    const html =
      '<!DOCTYPE html><html><head><title>layout</title>' +
      '<title>page</title></head><body><title>body</title></body></html>';
    expect(await pipe([html])).toBe(
      '<!DOCTYPE html><html><head><title>page</title></head>' +
        '<body><title>body</title></body></html>',
    );
  });

  test('handles a head split across chunks', async () => {
    const chunks = [
      '<html><head><title>lay',
      'out</title><title>pa',
      'ge</title></he',
      'ad><body>hi</body></html>',
    ];
    expect(await pipe(chunks)).toBe(
      '<html><head><title>page</title></head><body>hi</body></html>',
    );
  });

  test('handles the closing tag split across a chunk boundary', async () => {
    expect(
      await pipe([
        '<html><head><title>a</title><title>b</title></',
        'head><body/></html>',
      ]),
    ).toBe('<html><head><title>b</title></head><body/></html>');
  });

  test('does not end the head at a `</head>` inside a script', async () => {
    const html =
      '<html><head><title>layout</title>' +
      '<script>const s = "</head>";</script>' +
      '<title>page</title></head><body>hi</body></html>';
    expect(await pipe([html])).toBe(
      '<html><head><script>const s = "</head>";</script>' +
        '<title>page</title></head><body>hi</body></html>',
    );
  });

  test('does not end the head at a `</head>` inside a template', async () => {
    const html =
      '<html><head><title>layout</title>' +
      '<template><p></head></p></template>' +
      '<title>page</title></head><body>hi</body></html>';
    expect(await pipe([html])).toBe(
      '<html><head><template><p></head></p></template>' +
        '<title>page</title></head><body>hi</body></html>',
    );
  });

  test('passes through a document with no head', async () => {
    // The shell rendered for an SSR error closes no head.
    const html = '<html><body></body></html>';
    expect(await pipe([html])).toBe(html);
  });

  test('does not split multi-byte characters across chunks', async () => {
    const html =
      '<html><head><title>あ</title><title>日本語</title></head><body/></html>';
    const bytes = enc.encode(html);
    const chunks: Uint8Array[] = [];
    // 7-byte slices land inside the multi-byte sequences.
    for (let i = 0; i < bytes.length; i += 7) {
      chunks.push(bytes.subarray(i, i + 7));
    }
    expect(await pipeBytes(chunks)).toBe(
      '<html><head><title>日本語</title></head><body/></html>',
    );
  });
});
