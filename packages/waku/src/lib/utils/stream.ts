// Utility functions for web streams (not Node.js streams)

export const stringToStream = (str: string): ReadableStream => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(str));
      controller.close();
    },
  });
};

export const streamToBase64 = async (
  stream: ReadableStream,
): Promise<string> => {
  const reader = stream.getReader();
  let binary = '';
  let result: ReadableStreamReadResult<unknown>;
  do {
    result = await reader.read();
    if (result.value) {
      if (!(result.value instanceof Uint8Array)) {
        throw new Error('Unexpected buffer type');
      }
      for (let i = 0; i < result.value.length; i++) {
        binary += String.fromCharCode(result.value[i]!);
      }
    }
  } while (!result.done);
  return btoa(binary);
};

export const base64ToStream = (base64: string): ReadableStream => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes]).stream();
};

function concatUint8Array(chunks: readonly Uint8Array[]): Uint8Array {
  if (chunks.length === 1) {
    return chunks[0]!;
  }
  const total = chunks.reduce((n, chunk) => n + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function batchReadableStream(
  input: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const buffer: Uint8Array[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flushBuffer = (
    controller: TransformStreamDefaultController<Uint8Array>,
  ): void => {
    clearTimeout(timer);
    timer = undefined;
    if (buffer.length) {
      try {
        controller.enqueue(concatUint8Array(buffer));
      } catch {
        // ignore errors
        // ref: https://github.com/wakujs/waku/pull/1863#discussion_r2634546953
      }
      buffer.length = 0;
    }
  };

  return input.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        buffer.push(chunk);
        if (!timer) {
          timer = setTimeout(() => flushBuffer(controller));
        }
      },
      flush(controller) {
        flushBuffer(controller);
      },
    }),
  );
}

// Stream Multiplexer

type Frame =
  | { type: 'start'; key: string }
  | { type: 'chunk'; key: string; chunk: Uint8Array }
  | { type: 'end'; key: string }
  | { type: 'error'; key: string; error: unknown }
  | { type: 'done' };

export function produceMultiplexedStream(
  fn: (
    callback: (key: string, stream: ReadableStream) => Promise<void>,
  ) => Promise<void>,
): ReadableStream<Frame> {
  let controller: ReadableStreamDefaultController<Frame>;

  const frameStream = new ReadableStream<Frame>({
    start(ctrl) {
      controller = ctrl;
    },
  });

  const callback = async (key: string, stream: ReadableStream) => {
    controller.enqueue({ type: 'start', key });
    const reader = stream.getReader();
    try {
      let result: ReadableStreamReadResult<unknown>;
      do {
        result = await reader.read();
        if (result.value) {
          if (!(result.value instanceof Uint8Array)) {
            throw new Error('Unexpected buffer type');
          }
          controller.enqueue({ type: 'chunk', key, chunk: result.value });
        }
      } while (!result.done);
      controller.enqueue({ type: 'end', key });
    } catch (err) {
      controller.enqueue({ type: 'error', key, error: err });
    }
  };

  fn(callback).then(
    () => {
      controller.enqueue({ type: 'done' });
      controller.close();
    },
    (err) => controller.error(err),
  );

  return frameStream;
}

export async function consumeMultiplexedStream(
  frameStream: ReadableStream<Frame>,
  callback: (key: string, stream: ReadableStream<Uint8Array>) => Promise<void>,
): Promise<void> {
  const controllers = new Map<
    string,
    ReadableStreamDefaultController<Uint8Array>
  >();
  const promises: Promise<void>[] = [];

  const reader = frameStream.getReader();
  let result: ReadableStreamReadResult<Frame>;
  do {
    result = await reader.read();
    const frame = result.value;
    switch (frame?.type) {
      case 'start': {
        const stream = new ReadableStream<Uint8Array>({
          start(ctrl) {
            controllers.set(frame.key, ctrl);
          },
        });
        promises.push(callback(frame.key, stream));
        break;
      }
      case 'chunk':
        controllers.get(frame.key)?.enqueue(frame.chunk);
        break;
      case 'end':
        controllers.get(frame.key)?.close();
        controllers.delete(frame.key);
        break;
      case 'error':
        controllers.get(frame.key)?.error(frame.error);
        controllers.delete(frame.key);
        break;
      case 'done':
        break;
    }
  } while (!result.done);

  await Promise.all(promises);
}
