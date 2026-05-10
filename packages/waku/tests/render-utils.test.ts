import { describe, expect, test, vi } from 'vitest';
import { createRenderUtils } from '../src/lib/utils/render.js';

const makeRenderUtils = () => {
  const renderToReadableStream = vi.fn(
    (_data: unknown, _options?: object, _extraOptions?: object) =>
      new ReadableStream(),
  );
  const createFromReadableStream = vi.fn();
  const renderUtils = createRenderUtils(
    undefined,
    renderToReadableStream,
    createFromReadableStream,
    async () => ({}) as any,
  );
  return { renderToReadableStream, renderUtils };
};

describe('createRenderUtils', () => {
  test('adds server function value with the renderRsc value option', async () => {
    const { renderToReadableStream, renderUtils } = makeRenderUtils();

    await renderUtils.renderRsc({ App: 'app' }, { value: undefined });

    expect(renderToReadableStream).toHaveBeenCalledWith(
      { App: 'app', _value: undefined },
      expect.anything(),
      expect.anything(),
    );
  });

  test('rejects reserved RSC element IDs', async () => {
    const { renderUtils } = makeRenderUtils();

    await expect(renderUtils.renderRsc({ _foo: 'app' })).rejects.toThrow(
      'RSC element IDs starting with "_" are reserved for Waku internals: _foo',
    );
  });

  test('HTML response sets charset=utf-8 (full document reload decoding)', async () => {
    const renderToReadableStream = vi.fn(
      (_data: unknown, _options?: object, _extraOptions?: object) =>
        new ReadableStream(),
    );
    const fakeHtmlStream = new ReadableStream();
    const renderHtmlStream = vi.fn().mockResolvedValue({
      stream: fakeHtmlStream,
      status: undefined,
    });
    const renderUtils = createRenderUtils(
      undefined,
      renderToReadableStream,
      vi.fn(),
      async () =>
        ({
          INTERNAL_renderHtmlStream: renderHtmlStream,
        }) as any,
    );

    const res = await renderUtils.renderHtml(new ReadableStream(), 'app', {
      rscPath: '',
    });

    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
  });
});
