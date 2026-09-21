import { injectRSCPayload } from 'rsc-html-stream/server';
import { describe, expect, test } from 'vitest';
import {
  dedupeHeadMetadataForTest,
  dedupeHtmlMetadataStream,
} from '../src/lib/utils/html-metadata.js';

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { ignoreBOM: true });

const pipeBytes = async (
  chunks: readonly Uint8Array[],
  maxBufferedHead?: number,
): Promise<string> => {
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  const out: Uint8Array[] = [];
  const reader = input
    .pipeThrough(dedupeHtmlMetadataStream({}, maxBufferedHead))
    .getReader();
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

const pipe = (
  chunks: readonly string[],
  maxBufferedHead?: number,
): Promise<string> =>
  pipeBytes(
    chunks.map((chunk) => enc.encode(chunk)),
    maxBufferedHead,
  );

describe('dedupeHeadMetadataForTest', () => {
  test('keeps the last title', () => {
    expect(
      dedupeHeadMetadataForTest('<title>layout</title><title>page</title>'),
    ).toBe('<title>page</title>');
  });

  test('keeps the last description and og tag', () => {
    const head =
      '<meta name="description" content="layout"/>' +
      '<meta property="og:title" content="layout"/>' +
      '<meta name="description" content="page"/>' +
      '<meta property="og:title" content="page"/>';
    expect(dedupeHeadMetadataForTest(head)).toBe(
      '<meta name="description" content="page"/>' +
        '<meta property="og:title" content="page"/>',
    );
  });

  test('deduplicates each scalar og property independently', () => {
    const head =
      '<meta property="og:title" content="a"/>' +
      '<meta property="og:site_name" content="b"/>' +
      '<meta property="og:title" content="c"/>';
    expect(dedupeHeadMetadataForTest(head)).toBe(
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
    expect(dedupeHeadMetadataForTest(head)).toBe(head);
  });

  test('leaves raw text in script and style untouched', () => {
    const head =
      '<title>layout</title>' +
      '<script>const h = "<title>example</title>";</script>' +
      '<style>/* <meta name="description" content="x"> */</style>' +
      '<title>page</title>';
    expect(dedupeHeadMetadataForTest(head)).toBe(
      '<script>const h = "<title>example</title>";</script>' +
        '<style>/* <meta name="description" content="x"> */</style>' +
        '<title>page</title>',
    );
  });

  test('ignores metadata inside template and resumes after it', () => {
    expect(
      dedupeHeadMetadataForTest(
        '<title>a</title><template><title>t</title></template><title>b</title>',
      ),
    ).toBe('<template><title>t</title></template><title>b</title>');
  });

  test('ignores metadata inside nested templates', () => {
    expect(
      dedupeHeadMetadataForTest(
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
      dedupeHeadMetadataForTest(
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
      dedupeHeadMetadataForTest(
        '<title>a</title><template><!-- <template> --></template><title>b</title>',
      ),
    ).toBe('<template><!-- <template> --></template><title>b</title>');
  });

  test('honours a self-closing tag, as foreign content requires', () => {
    expect(
      dedupeHeadMetadataForTest(
        '<title>a</title><svg><path/><title>icon</title></svg><title>b</title>',
      ),
    ).toBe('<svg><path/><title>icon</title></svg><title>b</title>');
  });

  test('leaves the escaped state where a parser leaves it', () => {
    // `<!-->` and `<!--->` reach `>` still in the dash dash state, so the
    // `<script>` after them is text and the `</script>` really does close.
    for (const bang of ['<!-->', '<!--->', '<!--<!-->']) {
      const script = `<script>${bang}<script></script>`;
      expect(
        dedupeHeadMetadataForTest(
          `<title>a</title>${script}<title>trap</title></script><title>b</title>`,
        ),
      ).toBe(`${script}</script><title>b</title>`);
    }
  });

  test('keeps a `</script>` a parser reads as script text', () => {
    // `<!--<script` starts the double escaped state, where the next
    // `</script>` returns to the escaped state instead of ending the element.
    const script =
      '<script><!--<script></script><title>trap</title>--></script>';
    expect(
      dedupeHeadMetadataForTest(`<title>a</title>${script}<title>b</title>`),
    ).toBe(`${script}<title>b</title>`);
  });

  test('leaves raw text whose close tag name runs into punctuation', () => {
    const script =
      '<script>const s = "</script!><title>trap</title>";</script>';
    expect(
      dedupeHeadMetadataForTest(`<title>a</title>${script}<title>b</title>`),
    ).toBe(`${script}<title>b</title>`);
    const style =
      '<style>.a{content:"</style:foo><title>trap</title>"}</style>';
    expect(
      dedupeHeadMetadataForTest(`<title>a</title>${style}<title>b</title>`),
    ).toBe(`${style}<title>b</title>`);
  });

  test('honours a self-closing raw text tag inside foreign content', () => {
    expect(
      dedupeHeadMetadataForTest(
        '<title>a</title><svg><title/></svg><title>b</title>',
      ),
    ).toBe('<svg><title/></svg><title>b</title>');
    const nested = '<template><svg><title/></svg></template>';
    expect(
      dedupeHeadMetadataForTest(`<title>a</title>${nested}<title>b</title>`),
    ).toBe(`${nested}<title>b</title>`);
  });

  test('ignores metadata inside inline svg', () => {
    expect(
      dedupeHeadMetadataForTest(
        '<title>page</title><svg><title>icon</title></svg>',
      ),
    ).toBe('<title>page</title><svg><title>icon</title></svg>');
  });

  test('ignores an empty comment rather than abandoning the scan', () => {
    expect(
      dedupeHeadMetadataForTest('<title>a</title><!--><title>b</title>'),
    ).toBe('<!--><title>b</title>');
  });

  test('does not merge metadata across noscript', () => {
    expect(
      dedupeHeadMetadataForTest(
        '<meta name="description" content="a"/>' +
          '<noscript><meta name="description" content="no-js"/></noscript>' +
          '<meta name="description" content="b"/>',
      ),
    ).toBe(
      '<noscript><meta name="description" content="no-js"/></noscript>' +
        '<meta name="description" content="b"/>',
    );
  });

  test('keeps scanning past any element that does not own its content', () => {
    // A browser ends the head at each of these, putting what follows in the
    // body, where the first title still wins.
    const stray = ['br', 'img src="/x.png"', 'hr', 'input', 'div', 'foo'];
    for (const tag of stray) {
      expect(
        dedupeHeadMetadataForTest(`<title>a</title><${tag}><title>b</title>`),
      ).toBe(`<${tag}><title>b</title>`);
    }
  });

  test('ends raw text at the first close tag, as a parser does', () => {
    expect(
      dedupeHeadMetadataForTest(
        '<title>a</title>' +
          '<noscript><style>i::after{content:"</noscript>"}</style>' +
          '<title>trap</title></noscript>' +
          '<title>b</title>',
      ),
    ).toBe(
      '<noscript><style>i::after{content:"</noscript>"}</style>' +
        '</noscript><title>b</title>',
    );
  });

  test('leaves a mismatched close tag inside a skipped element', () => {
    expect(
      dedupeHeadMetadataForTest(
        '<title>a</title><div><span></div><title>b</title>',
      ),
    ).toBe('<div><span></div><title>b</title>');
  });

  test('matches a filter entry whatever case it is written in', () => {
    const head =
      '<meta name="Description" content="a"><meta name="Description" content="b">';
    expect(
      dedupeHeadMetadataForTest(head, {
        metaNames: ['Description'],
        metaProperties: [],
      }),
    ).toBe('<meta name="Description" content="b">');
  });

  test('ignores tags inside comments', () => {
    const head =
      '<title>layout</title>' +
      '<!-- <title>commented</title> -->' +
      '<title>page</title>';
    expect(dedupeHeadMetadataForTest(head)).toBe(
      '<!-- <title>commented</title> --><title>page</title>',
    );
  });

  test('deduplicates a title carrying attributes', () => {
    expect(
      dedupeHeadMetadataForTest(
        '<title>Layout</title><title lang="en">Page</title>',
      ),
    ).toBe('<title lang="en">Page</title>');
  });

  test('leaves an itemProp title alone', () => {
    const head = '<title>Layout</title><title itemProp="name">Item</title>';
    expect(dedupeHeadMetadataForTest(head)).toBe(head);
  });

  test('matches metadata names case-insensitively', () => {
    expect(
      dedupeHeadMetadataForTest(
        '<meta name="description" content="layout"/>' +
          '<meta name="Description" content="page"/>',
      ),
    ).toBe('<meta name="Description" content="page"/>');
  });

  test('merges the meta names the filter names', () => {
    const head =
      '<meta name="robots" content="index"/>' +
      '<meta name="robots" content="noindex"/>';
    expect(dedupeHeadMetadataForTest(head)).toBe(head);
    expect(dedupeHeadMetadataForTest(head, { metaNames: ['robots'] })).toBe(
      '<meta name="robots" content="noindex"/>',
    );
  });

  test('fills in a filter field left undefined', () => {
    // A plain-JS waku.config.js is not held to exactOptionalPropertyTypes.
    const head =
      '<meta name="description" content="a"/>' +
      '<meta name="description" content="b"/>';
    expect(
      dedupeHeadMetadataForTest(head, { metaNames: undefined } as never),
    ).toBe('<meta name="description" content="b"/>');
  });

  test('an empty filter still merges the title', () => {
    expect(
      dedupeHeadMetadataForTest(
        '<title>a</title><meta name="description" content="x"/>' +
          '<title>b</title><meta name="description" content="y"/>',
        { metaNames: [], metaProperties: [] },
      ),
    ).toBe(
      '<meta name="description" content="x"/>' +
        '<title>b</title><meta name="description" content="y"/>',
    );
  });

  test('leaves tags outside the allowlist untouched', () => {
    const head =
      '<meta charSet="utf-8"/>' +
      '<meta name="viewport" content="width=device-width"/>' +
      '<meta name="generator" content="Waku"/>' +
      '<meta name="viewport" content="width=400"/>' +
      '<meta name="generator" content="App"/>';
    expect(dedupeHeadMetadataForTest(head)).toBe(head);
  });

  test('matches tag boundaries around escaped angle brackets', () => {
    // React escapes `<`, `>`, `&` and `"` in text and attribute values alike,
    // so a tag ends at the first `>` and title text at the first `<`.
    const head =
      '<head><meta charSet="utf-8"/><title>a &gt; b</title>' +
      '<link rel="stylesheet" href="/a.css"/>' +
      '<title>c &quot;d&quot;</title></head>';
    expect(dedupeHeadMetadataForTest(head)).toBe(
      '<head><meta charSet="utf-8"/>' +
        '<link rel="stylesheet" href="/a.css"/>' +
        '<title>c &quot;d&quot;</title></head>',
    );
  });

  test('returns the input unchanged when there is nothing to remove', () => {
    const head = '<title>only</title><meta name="description" content="one"/>';
    expect(dedupeHeadMetadataForTest(head)).toBe(head);
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

  test('waits for a comment opener split across a chunk boundary', async () => {
    expect(
      await pipe([
        '<html><head><title>a</title><!',
        '-- <title>trap</title> --><title>b</title></head><body/></html>',
      ]),
    ).toBe(
      '<html><head><!-- <title>trap</title> --><title>b</title>' +
        '</head><body/></html>',
    );
  });

  test('waits for a comment opener split after its second dash', async () => {
    expect(
      await pipe([
        '<html><head><title>a</title><!-',
        '-</head>--><title>b</title></head><body/></html>',
      ]),
    ).toBe('<html><head><!--</head>--><title>b</title></head><body/></html>');
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

  test('merges a head the RSC payload is injected into', async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const html = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(enc.encode('<html><head><title>layout</title>'));
        // injectRSCPayload writes the payload after the tick it first sees
        // html in, which need not be the tick that closes the head.
        await tick();
        await tick();
        controller.enqueue(
          enc.encode('<title>page</title></head><body>hi</body></html>'),
        );
        controller.close();
      },
    });
    const rsc = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('["</head> <title>trap</title>"]'));
        controller.close();
      },
    });
    const out = html
      .pipeThrough(injectRSCPayload(rsc, {}))
      .pipeThrough(dedupeHtmlMetadataStream());
    const reader = out.getReader();
    let text = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      text += dec.decode(value, { stream: true });
    }
    expect(text.indexOf('<script>')).toBeLessThan(text.indexOf('</head>'));
    expect(text).toContain('__FLIGHT_DATA');
    expect(text).not.toContain('<title>layout</title>');
    expect(text).toContain('<title>page</title></head>');
  });

  test('finds the head when every byte arrives in its own chunk', async () => {
    const html =
      '<html><head><title>layout</title><title>page</title></head>' +
      '<body>hi</body></html>';
    const bytes = enc.encode(html);
    const chunks = Array.from(bytes, (_, i) => bytes.subarray(i, i + 1));
    expect(await pipeBytes(chunks)).toBe(
      '<html><head><title>page</title></head><body>hi</body></html>',
    );
  });

  test('gives up rather than buffer an unfinished head past the cap', async () => {
    // Injected RSC scripts count toward the cap as well, so a head that has
    // not closed by then is emitted as it was rendered.
    const opening = `<html><head><title>a</title><!--${'y'.repeat(64)}-->`;
    const rest = '<title>b</title></head><body>hi</body></html>';
    expect(await pipe([opening, rest], 32)).toBe(opening + rest);
    expect(await pipe([opening, rest])).toBe(
      `<html><head><!--${'y'.repeat(64)}--><title>b</title></head>` +
        '<body>hi</body></html>',
    );
  });

  test('passes through a document with no head', async () => {
    const html = '<html><body></body></html>';
    expect(await pipe([html])).toBe(html);
  });

  test('keeps a character split by the chunk that closes the head', async () => {
    const bytes = enc.encode(
      '<html><head><title>a</title><title>b</title></head>' +
        '<body>\u65e5\u672c</body></html>',
    );
    // two of the three bytes of the first body character
    const cut = bytes.indexOf(0xe6) + 2;
    expect(await pipeBytes([bytes.subarray(0, cut), bytes.subarray(cut)])).toBe(
      '<html><head><title>b</title></head><body>\u65e5\u672c</body></html>',
    );
  });

  test('does not shift the buffer on a byte it cannot decode', async () => {
    const head = '<html><head><title>a</title><title>b</title>';
    const tail = '</head><body>xy</body></html>';
    const bytes = new Uint8Array([
      ...enc.encode(head),
      0xff,
      ...enc.encode(tail),
    ]);
    expect(await pipeBytes([bytes])).toBe(
      `<html><head><title>b</title>\uFFFD${tail}`,
    );
  });

  test('preserves a byte order mark', async () => {
    const html =
      '\uFEFF<html><head><title>a</title><title>b</title></head>' +
      '<body>hi</body></html>';
    expect(await pipe([html])).toBe(
      '\uFEFF<html><head><title>b</title></head><body>hi</body></html>',
    );
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
