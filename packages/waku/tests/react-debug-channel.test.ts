import { afterEach, describe, expect, test } from 'vitest';
import {
  DEBUG_CMD_EVENT,
  DEBUG_DATA_EVENT,
  DEBUG_ID_HEADER,
} from '../src/lib/utils/react-debug-channel.js';
import { rscDevtoolsPlugin } from '../src/lib/vite-plugins/rsc-devtools.js';

const enc = new TextEncoder();

const makeRes = () => {
  const listeners = new Map<string, () => void>();
  return {
    on: (event: string, cb: () => void) => listeners.set(event, cb),
    emitClose: () => listeners.get('close')?.(),
  };
};

const wait = () => new Promise((resolve) => setTimeout(resolve, 0));

type Middleware = (
  req: {
    headers: Record<string, string | string[] | undefined>;
    rawHeaders?: string[];
  },
  res: unknown,
  next: () => void,
) => void;

type Req = Parameters<Middleware>[0];

const setupPlugin = async () => {
  const hotListeners = new Map<string, (data: unknown) => void>();
  const sent: { event: string; data: unknown }[] = [];
  let middleware: Middleware | undefined;
  const server = {
    environments: {
      client: {
        hot: {
          on(event: string, cb: (data: unknown) => void) {
            hotListeners.set(event, cb);
          },
          send(event: string, data: unknown) {
            sent.push({ event, data });
          },
        },
      },
    },
    middlewares: {
      use(fn: Middleware) {
        middleware = fn;
      },
    },
  };

  const plugin = rscDevtoolsPlugin();
  const configureServer = plugin.configureServer;
  if (!configureServer) {
    throw new Error('configureServer is not defined');
  }
  const serverHook =
    typeof configureServer === 'function'
      ? configureServer
      : configureServer.handler;
  const postConfigure = await serverHook.call({} as never, server as never);
  if (typeof postConfigure === 'function') {
    postConfigure();
  }

  return { hotListeners, sent, middleware: middleware! };
};

const readAll = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
};

afterEach(() => {
  delete (globalThis as any).__WAKU_DEBUG_ID__;
  delete (globalThis as any).__WAKU_DEBUG_CHANNELS__;
});

describe('react debug channel', () => {
  test('plugin skips non-debug non-html requests', async () => {
    const { middleware } = await setupPlugin();

    const req: Req = {
      headers: { accept: 'application/json' },
      rawHeaders: ['Accept', 'application/json'],
    };
    let nextCalled = false;
    middleware(req, {}, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.headers[DEBUG_ID_HEADER.toLowerCase()]).toBeUndefined();
    expect((globalThis as any).__WAKU_DEBUG_CHANNELS__).toBeUndefined();
  });

  test('plugin handles early ready before request middleware', async () => {
    const { hotListeners, sent, middleware } = await setupPlugin();

    hotListeners.get(DEBUG_CMD_EVENT)?.({ i: 'early-debug-id' });

    const req: Req = {
      headers: {
        accept: 'text/x-component',
        [DEBUG_ID_HEADER.toLowerCase()]: 'early-debug-id',
      },
      rawHeaders: [
        DEBUG_ID_HEADER,
        'early-debug-id',
        'Accept',
        'text/x-component',
      ],
    };
    middleware(req, makeRes(), () => {});

    const channels = (globalThis as any).__WAKU_DEBUG_CHANNELS__ as Map<
      string,
      {
        readable?: ReadableStream<Uint8Array>;
        writable?: WritableStream<Uint8Array>;
      }
    >;
    const entry = channels.get('early-debug-id');
    const writer = entry!.writable!.getWriter();
    await writer.write(enc.encode('early'));
    await wait();

    expect(sent).toEqual([
      {
        event: DEBUG_DATA_EVENT,
        data: { i: 'early-debug-id', b: btoa('early') },
      },
    ]);
  });

  test('plugin registers nothing for an html request', async () => {
    const { middleware } = await setupPlugin();
    const req: Req = {
      headers: { accept: 'text/html' },
      rawHeaders: ['Accept', 'text/html'],
    };
    middleware(req, makeRes(), () => {});
    expect(req.headers[DEBUG_ID_HEADER.toLowerCase()]).toBeUndefined();
    expect(
      ((globalThis as any).__WAKU_DEBUG_CHANNELS__ as Map<string, unknown>)
        ?.size ?? 0,
    ).toBe(0);
  });

  test('plugin buffers a client session until ready', async () => {
    const { hotListeners, sent, middleware } = await setupPlugin();

    const debugId = 'test-debug-id';
    const req: Req = {
      headers: { [DEBUG_ID_HEADER.toLowerCase()]: debugId },
    };
    middleware(req, makeRes(), () => {});

    const channels = (globalThis as any).__WAKU_DEBUG_CHANNELS__ as Map<
      string,
      {
        readable?: ReadableStream<Uint8Array>;
        writable?: WritableStream<Uint8Array>;
      }
    >;
    const entry = channels.get(debugId);
    expect(entry?.readable).toBeDefined();
    expect(entry?.writable).toBeDefined();

    const writer = entry!.writable!.getWriter();
    await writer.write(enc.encode('reply'));
    expect(sent).toEqual([]);

    hotListeners.get(DEBUG_CMD_EVENT)?.({
      i: debugId,
    });
    await wait();
    expect(sent).toEqual([
      {
        event: DEBUG_DATA_EVENT,
        data: { i: debugId, b: btoa('reply') },
      },
    ]);

    hotListeners.get(DEBUG_CMD_EVENT)?.({
      i: debugId,
      b: btoa('Q:1\n'),
    });
    hotListeners.get(DEBUG_CMD_EVENT)?.({
      i: debugId,
      d: true,
    });
    await wait();
    expect(await readAll(entry!.readable!)).toBe('Q:1\n');

    await writer.close();
    await wait();
    expect(sent).toEqual([
      {
        event: DEBUG_DATA_EVENT,
        data: { i: debugId, b: btoa('reply') },
      },
      {
        event: DEBUG_DATA_EVENT,
        data: { i: debugId, d: true },
      },
    ]);
  });

  test('plugin flushes buffered initial chunks even if ready arrives after server close', async () => {
    const { hotListeners, sent, middleware } = await setupPlugin();
    const debugId = 'test-debug-id';
    const req: Req = {
      headers: { [DEBUG_ID_HEADER.toLowerCase()]: debugId },
    };
    middleware(req, makeRes(), () => {});
    const channels = (globalThis as any).__WAKU_DEBUG_CHANNELS__ as Map<
      string,
      {
        readable?: ReadableStream<Uint8Array>;
        writable?: WritableStream<Uint8Array>;
      }
    >;
    const entry = channels.get(debugId);

    const writer = entry!.writable!.getWriter();
    await writer.write(enc.encode('late'));
    await writer.close();
    await wait();

    expect(sent).toEqual([]);

    hotListeners.get(DEBUG_CMD_EVENT)?.({
      i: debugId,
    });
    await wait();

    expect(sent).toEqual([
      {
        event: DEBUG_DATA_EVENT,
        data: { i: debugId, b: btoa('late') },
      },
      {
        event: DEBUG_DATA_EVENT,
        data: { i: debugId, d: true },
      },
    ]);
  });

  test('plugin sends done immediately when stream closes after ready', async () => {
    const { hotListeners, sent, middleware } = await setupPlugin();
    const debugId = 'test-debug-id';
    const req: Req = {
      headers: { [DEBUG_ID_HEADER.toLowerCase()]: debugId },
    };
    middleware(req, makeRes(), () => {});
    const channels = (globalThis as any).__WAKU_DEBUG_CHANNELS__ as Map<
      string,
      {
        readable?: ReadableStream<Uint8Array>;
        writable?: WritableStream<Uint8Array>;
      }
    >;
    const entry = channels.get(debugId);

    hotListeners.get(DEBUG_CMD_EVENT)?.({
      i: debugId,
    });
    await wait();

    const writer = entry!.writable!.getWriter();
    await writer.close();
    await wait();

    expect(sent).toEqual([
      {
        event: DEBUG_DATA_EVENT,
        data: { i: debugId, d: true },
      },
    ]);
  });

  test('the response closing concludes a session whose writable never closes', async () => {
    const { hotListeners, sent, middleware } = await setupPlugin();
    const debugId = 'test-debug-id';
    const req: Req = {
      headers: { [DEBUG_ID_HEADER.toLowerCase()]: debugId },
    };
    const res = makeRes();
    middleware(req, res, () => {});
    const channels = (globalThis as any).__WAKU_DEBUG_CHANNELS__ as Map<
      string,
      { writable?: WritableStream<Uint8Array> }
    >;
    const writer = channels.get(debugId)!.writable!.getWriter();
    await writer.write(enc.encode('reply'));
    // the render aborted, so the writable is never closed; the response ends
    res.emitClose();
    await wait();
    expect(sent).toEqual([]);

    hotListeners.get(DEBUG_CMD_EVENT)?.({ i: debugId });
    await wait();
    expect(sent).toEqual([
      { event: DEBUG_DATA_EVENT, data: { i: debugId, b: btoa('reply') } },
      { event: DEBUG_DATA_EVENT, data: { i: debugId, d: true } },
    ]);
  });
});
