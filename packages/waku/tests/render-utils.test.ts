import { describe, expect, test, vi } from 'vitest';
import { createCustomError } from '../src/lib/utils/custom-errors.js';
import { ETAG_ID_PREFIX, IMMUTABLE_ETAG } from '../src/lib/utils/etags.js';
import { createRenderUtils } from '../src/lib/utils/render.js';

const makeRenderUtils = () => {
  const renderToReadableStream = vi.fn(
    (_data: unknown, _options?: object, _extraOptions?: object) =>
      new ReadableStream(),
  );
  const onRenderError = vi.fn();
  const renderUtils = createRenderUtils({
    temporaryReferences: undefined,
    renderToReadableStream,
    loadSsrEntryModule: async () => ({}) as any,
    buildId: '',
    onRenderError,
  });
  return { renderToReadableStream, renderUtils, onRenderError };
};

describe('createRenderUtils', () => {
  test('carries a document location', async () => {
    const { renderToReadableStream, renderUtils } = makeRenderUtils();

    await renderUtils.renderRsc(
      {},
      { documentLocation: 'https://other.example/x' },
    );

    expect(renderToReadableStream).toHaveBeenCalledWith(
      { _location: 'https://other.example/x' },
      expect.anything(),
      expect.anything(),
    );
  });

  test('adds server function value with the renderRsc value option', async () => {
    const { renderToReadableStream, renderUtils } = makeRenderUtils();

    await renderUtils.renderRsc({ App: 'app' }, { value: undefined });

    expect(renderToReadableStream).toHaveBeenCalledWith(
      { App: 'app', _value: undefined },
      expect.anything(),
      expect.anything(),
    );
  });

  test('attaches _etag:<slot> keys from the etags option, past id validation', async () => {
    const { renderToReadableStream, renderUtils } = makeRenderUtils();

    await renderUtils.renderRsc(
      { App: 'app' },
      { etags: { page: 'v1', slice: IMMUTABLE_ETAG } },
    );

    expect(renderToReadableStream).toHaveBeenCalledWith(
      expect.objectContaining({
        App: 'app',
        [`${ETAG_ID_PREFIX}page`]: 'v1',
        [`${ETAG_ID_PREFIX}slice`]: IMMUTABLE_ETAG,
      }),
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

  test('creates a debug channel for each RSC render', async () => {
    const renderToReadableStream = vi.fn(() => new ReadableStream());
    const firstDebugChannel = {
      readable: new ReadableStream(),
      writable: new WritableStream(),
    };
    const secondDebugChannel = {
      readable: new ReadableStream(),
      writable: new WritableStream(),
    };
    const createDebugChannel = vi
      .fn()
      .mockReturnValueOnce(firstDebugChannel)
      .mockReturnValueOnce(secondDebugChannel);
    const renderUtils = createRenderUtils({
      temporaryReferences: undefined,
      renderToReadableStream,
      loadSsrEntryModule: async () => ({}) as any,
      buildId: '',
      createDebugChannel,
    });

    await renderUtils.renderRsc({ App: 'first' });
    await renderUtils.renderRsc({ App: 'second' });

    expect(renderToReadableStream).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ debugChannel: firstDebugChannel }),
      expect.anything(),
    );
    expect(renderToReadableStream).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ debugChannel: secondDebugChannel }),
      expect.anything(),
    );
    expect(createDebugChannel).toHaveBeenCalledTimes(2);
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
    const onRenderError = vi.fn();
    const renderUtils = createRenderUtils({
      temporaryReferences: undefined,
      renderToReadableStream,
      loadSsrEntryModule: async () =>
        ({
          INTERNAL_renderHtmlStream: renderHtmlStream,
        }) as any,
      buildId: '',
      onRenderError,
    });

    const res = await renderUtils.renderHtml(new ReadableStream(), 'app', {
      rscPath: '',
    });

    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(renderHtmlStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ onRenderError }),
    );
  });

  test('reports render errors except custom errors', async () => {
    const { renderToReadableStream, renderUtils, onRenderError } =
      makeRenderUtils();

    await renderUtils.renderRsc({ App: 'app' });
    const { onError } = renderToReadableStream.mock.calls[0]![1] as {
      onError: (e: unknown) => string | undefined;
    };

    const error = new Error('boom');
    expect(onError(error)).toBeUndefined();
    // an error that came back through a Flight round trip keeps its digest
    const roundTripped = Object.assign(new Error('boom'), { digest: '' });
    expect(onError(roundTripped)).toBe('');
    const custom = createCustomError('not found', { status: 404 });
    expect(onError(custom)).toBe((custom as { digest?: string }).digest);

    expect(onRenderError.mock.calls).toEqual([[error], [roundTripped]]);
  });
});
