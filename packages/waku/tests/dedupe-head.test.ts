import dedent from 'dedent';
import { describe, expect, test } from 'vitest';
import {
  dedupeHead,
  dedupeHeadTags,
  parseAttributes,
} from '../src/lib/utils/dedupe-head.js';

describe('dedupeHead', () => {
  test('returns input unchanged when no head tag', () => {
    const html = '<html><body>content</body></html>';
    expect(dedupeHead(html)).toBe(html);
  });

  test('returns input unchanged when head has no duplicate tags', () => {
    const html = `<head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width">
      <title>Page Title</title>
    </head>`;
    expect(dedupeHead(html)).toBe(html);
  });

  test('deduplicates title tags, keeping the last one', () => {
    const html = dedent`<head>
      <title>Layout Title</title>
      <title>Page Title</title>
    </head>`;
    const result = dedupeHead(html);
    expect(result).toMatchInlineSnapshot(`
      "<head>
        <title>Page Title</title>
      </head>"
    `);
  });

  test('deduplicates meta name tags, keeping the last one', () => {
    const html = dedent`<head>
      <meta name="description" content="Layout description">
      <meta name="description" content="Page description">
    </head>`;
    const result = dedupeHead(html);
    expect(result).toMatchInlineSnapshot(`
      "<head>
        <meta name="description" content="Page description">
      </head>"
    `);
  });

  test('deduplicates meta property tags (Open Graph), keeping the last one', () => {
    const html = dedent`<head>
      <meta property="og:title" content="Layout OG Title">
      <meta property="og:title" content="Page OG Title">
    </head>`;
    const result = dedupeHead(html);
    expect(result).toMatchInlineSnapshot(`
      "<head>
        <meta property="og:title" content="Page OG Title">
      </head>"
    `);
  });

  test('deduplicates charset meta tag', () => {
    const html = dedent`<head>
      <meta charset="utf-8">
      <meta charset="iso-8859-1">
    </head>`;
    const result = dedupeHead(html);
    expect(result).toMatchInlineSnapshot(`
      "<head>
        <meta charset="iso-8859-1">
      </head>"
    `);
  });

  test('deduplicates http-equiv meta tags', () => {
    const html = dedent`<head>
      <meta http-equiv="refresh" content="5">
      <meta http-equiv="refresh" content="10">
    </head>`;
    const result = dedupeHead(html);
    expect(result).toMatchInlineSnapshot(`
      "<head>
        <meta http-equiv="refresh" content="10">
      </head>"
    `);
  });

  test('deduplicates link tags with same rel and href', () => {
    const html = dedent`<head>
      <link rel="canonical" href="/page">
      <link rel="canonical" href="/page">
    </head>`;
    const result = dedupeHead(html);
    expect(result).toMatchInlineSnapshot(`
      "<head>
        <link rel="canonical" href="/page">
      </head>"
    `);
  });

  test('keeps link tags with same rel but different href', () => {
    const html = dedent`<head>
      <link rel="stylesheet" href="/style1.css">
      <link rel="stylesheet" href="/style2.css">
    </head>`;
    const result = dedupeHead(html);
    expect(result).toMatchInlineSnapshot(`
      "<head>
        <link rel="stylesheet" href="/style1.css">
        <link rel="stylesheet" href="/style2.css">
      </head>"
    `);
  });

  test('keeps meta tags with different names', () => {
    const html = dedent`<head>
      <meta name="description" content="Description">
      <meta name="keywords" content="key1, key2">
      <meta name="author" content="Author">
    </head>`;
    const result = dedupeHead(html);
    expect(result).toMatchInlineSnapshot(`
      "<head>
        <meta name="description" content="Description">
        <meta name="keywords" content="key1, key2">
        <meta name="author" content="Author">
      </head>"
    `);
  });

  test('handles self-closing meta tags', () => {
    const html = dedent`<head>
      <meta name="description" content="Layout" />
      <meta name="description" content="Page" />
    </head>`;
    const result = dedupeHead(html);
    expect(result).toMatchInlineSnapshot(`
      "<head>
        <meta name="description" content="Page" />
      </head>"
    `);
  });

  test('preserves non-head-tag content between tags', () => {
    const html = dedent`<head>
      <!-- Comment -->
      <meta name="description" content="Page">
      <script>console.log('test')</script>
    </head>`;
    const result = dedupeHead(html);
    expect(result).toMatchInlineSnapshot(`
      "<head>
        <!-- Comment -->
        <meta name="description" content="Page">
        <script>console.log('test')</script>
      </head>"
    `);
  });

  test('handles mixed case tag names', () => {
    const html = dedent`<HEAD>
      <META name="description" content="Layout">
      <meta name="description" content="Page">
    </HEAD>`;
    const result = dedupeHead(html);
    expect(result).toMatchInlineSnapshot(`
      "<HEAD>
        <meta name="description" content="Page">
      </head>"
    `);
  });

  test('complex scenario with DEFAULT_HTML_HEAD overrides', () => {
    const html = dedent`<head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="generator" content="Waku">
      <meta name="description" content="Layout description">
      <title>Layout</title>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
      <meta name="description" content="Page description">
      <title>Page</title>
    </head>`;
    const result = dedupeHead(html);

    expect(result).toMatchInlineSnapshot(`
      "<head>
        <meta charset="utf-8">
        <meta name="generator" content="Waku">
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
        <meta name="description" content="Page description">
        <title>Page</title>
      </head>"
    `);
  });
});

describe('dedupeHeadTags', () => {
  async function transformHtml(html: string): Promise<string> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(html));
        controller.close();
      },
    });

    const transformedStream = stream.pipeThrough(dedupeHeadTags());
    const reader = transformedStream.getReader();

    let result = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value);
    }

    return result;
  }

  test('transforms full HTML document with duplicate tags', async () => {
    const html = dedent`<!DOCTYPE html>
<html>
<head>
<title>Layout</title>
<meta name="description" content="Layout">
<title>Page</title>
<meta name="description" content="Page">
</head>
<body>content</body>
</html>`;

    const result = await transformHtml(html);

    expect(result).toMatchInlineSnapshot(`
      "<!DOCTYPE html>
      <html>
      <head>
      <title>Page</title>
      <meta name="description" content="Page">
      </head>
      <body>content</body>
      </html>"
    `);
  });

  test('handles chunked input across head boundary', async () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const chunks = [
      '<!DOCTYPE html><html><he',
      'ad><title>Layout</title><tit',
      'le>Page</title></head><body>',
      'content</body></html>',
    ];

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    const transformedStream = stream.pipeThrough(dedupeHeadTags());
    const reader = transformedStream.getReader();

    let result = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value);
    }

    expect(result).toMatchInlineSnapshot(
      `"<!DOCTYPE html><html><head><title>Page</title></head><body>content</body></html>"`,
    );
  });

  test('passes through HTML without head tag unchanged', async () => {
    const html = '<div>no head here</div>';
    const result = await transformHtml(html);
    expect(result).toBe(html);
  });
});

describe('parseAttributes', () => {
  test('parses double-quoted values', () => {
    expect(
      parseAttributes('<meta name="description" content="hello world">'),
    ).toEqual({
      name: 'description',
      content: 'hello world',
    });
  });

  test('parses single-quoted values', () => {
    expect(
      parseAttributes("<meta name='description' content='hello world'>"),
    ).toEqual({
      name: 'description',
      content: 'hello world',
    });
  });

  test('parses unquoted values', () => {
    expect(parseAttributes('<meta charset=utf-8>')).toEqual({
      charset: 'utf-8',
    });
  });

  test('parses attributes with colons (namespaced)', () => {
    expect(parseAttributes('<meta xmlns:og="http://ogp.me/ns#">')).toEqual({
      'xmlns:og': 'http://ogp.me/ns#',
    });
  });

  test('parses data attributes', () => {
    expect(parseAttributes('<meta data-foo="bar" data-baz="qux">')).toEqual({
      'data-foo': 'bar',
      'data-baz': 'qux',
    });
  });

  test('parses http-equiv', () => {
    expect(parseAttributes('<meta http-equiv="refresh" content="5">')).toEqual({
      'http-equiv': 'refresh',
      content: '5',
    });
  });

  test('handles mixed quote styles', () => {
    expect(parseAttributes(`<meta name="foo" content='bar'>`)).toEqual({
      name: 'foo',
      content: 'bar',
    });
  });

  test('handles values with special characters', () => {
    expect(parseAttributes('<meta content="hello <world> & friends">')).toEqual(
      {
        content: 'hello <world> & friends',
      },
    );
  });

  test('handles empty values', () => {
    expect(parseAttributes('<meta name="" content="">')).toEqual({
      name: '',
      content: '',
    });
  });

  test('normalizes attribute names to lowercase', () => {
    expect(parseAttributes('<meta NAME="foo" Content="bar">')).toEqual({
      name: 'foo',
      content: 'bar',
    });
  });

  test('handles self-closing tags', () => {
    expect(
      parseAttributes('<meta name="description" content="test" />'),
    ).toEqual({
      name: 'description',
      content: 'test',
    });
  });
});
