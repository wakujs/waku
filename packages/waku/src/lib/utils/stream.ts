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

const FRAME_START = 0x01;
const FRAME_CHUNK = 0x02;
const FRAME_END = 0x03;
const FRAME_ERROR = 0x04;
const FRAME_DONE = 0x05;

const enc = new TextEncoder();
const dec = new TextDecoder();

function encodeFrame(frame: Frame): Uint8Array {
  switch (frame.type) {
    case 'chunk': {
      const keyBytes = enc.encode(frame.key);
      const out = new Uint8Array(
        1 + 2 + keyBytes.length + 4 + frame.chunk.length,
      );
      let offset = 0;
      out[offset++] = FRAME_CHUNK;
      new DataView(out.buffer).setUint16(offset, keyBytes.length);
      offset += 2;
      out.set(keyBytes, offset);
      offset += keyBytes.length;
      new DataView(out.buffer).setUint32(offset, frame.chunk.length);
      offset += 4;
      out.set(frame.chunk, offset);
      return out;
    }
    case 'error': {
      const keyBytes = enc.encode(frame.key);
      const payload = enc.encode(String(frame.error));
      const out = new Uint8Array(1 + 2 + keyBytes.length + 4 + payload.length);
      let offset = 0;
      out[offset++] = FRAME_ERROR;
      new DataView(out.buffer).setUint16(offset, keyBytes.length);
      offset += 2;
      out.set(keyBytes, offset);
      offset += keyBytes.length;
      new DataView(out.buffer).setUint32(offset, payload.length);
      offset += 4;
      out.set(payload, offset);
      return out;
    }
    case 'start':
    case 'end': {
      const keyBytes = enc.encode(frame.key);
      const out = new Uint8Array(1 + 2 + keyBytes.length);
      out[0] = frame.type === 'start' ? FRAME_START : FRAME_END;
      new DataView(out.buffer).setUint16(1, keyBytes.length);
      out.set(keyBytes, 3);
      return out;
    }
    case 'done':
      return new Uint8Array([FRAME_DONE]);
  }
}

function createFrameDecoder(): (data: Uint8Array) => Frame[] {
  let buffer: Uint8Array = new Uint8Array(0);

  return (data: Uint8Array): Frame[] => {
    buffer = concatUint8Array([buffer, data]);
    const frames: Frame[] = [];

    while (buffer.length > 0) {
      const type = buffer[0]!;
      if (type === FRAME_DONE) {
        frames.push({ type: 'done' });
        buffer = buffer.slice(1);
        continue;
      }
      // Need at least type + 2 byte key length
      if (buffer.length < 3) {
        break;
      }
      const keyLen = new DataView(buffer.buffer, buffer.byteOffset).getUint16(
        1,
      );
      const headerLen = 1 + 2 + keyLen;
      if (buffer.length < headerLen) {
        break;
      }
      const key = dec.decode(buffer.slice(3, 3 + keyLen));

      if (type === FRAME_START || type === FRAME_END) {
        frames.push({ type: type === FRAME_START ? 'start' : 'end', key });
        buffer = buffer.slice(headerLen);
        continue;
      }
      // chunk or error: need 4 byte payload length
      if (buffer.length < headerLen + 4) {
        break;
      }
      const payloadLen = new DataView(
        buffer.buffer,
        buffer.byteOffset,
      ).getUint32(headerLen);
      const totalLen = headerLen + 4 + payloadLen;
      if (buffer.length < totalLen) {
        break;
      }
      const payload = buffer.slice(headerLen + 4, totalLen);

      if (type === FRAME_CHUNK) {
        frames.push({ type: 'chunk', key, chunk: payload });
      } else {
        frames.push({ type: 'error', key, error: dec.decode(payload) });
      }
      buffer = buffer.slice(totalLen);
    }

    return frames;
  };
}

export function produceMultiplexedStream(
  fn: (
    callback: (key: string, stream: ReadableStream) => Promise<void>,
  ) => Promise<void>,
): ReadableStream<Uint8Array> {
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const frameStream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
    },
  });

  const callback = async (key: string, stream: ReadableStream) => {
    controller.enqueue(encodeFrame({ type: 'start', key }));
    const reader = stream.getReader();
    try {
      let result: ReadableStreamReadResult<unknown>;
      do {
        result = await reader.read();
        if (result.value) {
          if (!(result.value instanceof Uint8Array)) {
            throw new Error('Unexpected buffer type');
          }
          controller.enqueue(
            encodeFrame({ type: 'chunk', key, chunk: result.value }),
          );
        }
      } while (!result.done);
      controller.enqueue(encodeFrame({ type: 'end', key }));
    } catch (err) {
      controller.enqueue(encodeFrame({ type: 'error', key, error: err }));
    }
  };

  fn(callback).then(
    () => {
      controller.enqueue(encodeFrame({ type: 'done' }));
      controller.close();
    },
    (err) => controller.error(err),
  );

  return frameStream;
}

export async function consumeMultiplexedStream(
  frameStream: ReadableStream<Uint8Array>,
  callback: (key: string, stream: ReadableStream<Uint8Array>) => Promise<void>,
): Promise<void> {
  const controllers = new Map<
    string,
    ReadableStreamDefaultController<Uint8Array>
  >();
  const promises: Promise<void>[] = [];
  const decodeFrame = createFrameDecoder();

  const reader = frameStream.getReader();
  let result: ReadableStreamReadResult<Uint8Array>;
  do {
    result = await reader.read();
    const frames = (result.value && decodeFrame(result.value)) || [];
    for (const frame of frames) {
      switch (frame.type) {
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
        default:
          throw new Error(`Unknown frame type: ${JSON.stringify(frame)}`);
      }
    }
  } while (!result.done);

  await Promise.all(promises);
}
