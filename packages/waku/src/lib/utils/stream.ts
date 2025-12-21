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
        throw new Error('Unexepected buffer type');
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
