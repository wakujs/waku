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

  test('deduplicates each og property independently', () => {
    const head =
      '<meta property="og:title" content="a"/>' +
      '<meta property="og:image" content="b"/>' +
      '<meta property="og:title" content="c"/>';
    expect(dedupeHtmlMetadata(head)).toBe(
      '<meta property="og:image" content="b"/>' +
        '<meta property="og:title" content="c"/>',
    );
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
