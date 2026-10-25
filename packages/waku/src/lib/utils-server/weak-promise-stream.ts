import { getWeakPromise } from './weak-promise.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const lengthTags = new Set(
  Array.from('TAOoUSsLlGgMmVb', (tag) => tag.charCodeAt(0)),
);
type WeakState = NonNullable<ReturnType<typeof getWeakPromise>>;
type Entry = {
  placeholder: Promise<string>;
  id?: string;
  unsubscribe?: () => void;
};

function forwardFlightRecords(
  emit: (bytes: Uint8Array) => void,
  consumeMarker: (id: string, row: string) => boolean,
  flush: () => void,
  markerLength: number,
) {
  let buffered = new Uint8Array(0);
  let remaining = 0;
  let line:
    | true
    | { id: string; header: Uint8Array; parts: Uint8Array[]; size: number }
    | undefined;
  let flushRequested = false;
  const partial = () => !!buffered.length || !!remaining || line !== undefined;
  const boundary = () => {
    if (flushRequested) {
      flushRequested = false;
      flush();
    }
  };
  return {
    requestFlush() {
      flushRequested = true;
      if (!partial()) {
        boundary();
      }
    },
    end() {
      if (partial()) {
        throw new Error('Truncated Flight record');
      }
      boundary();
    },
    push(chunk: Uint8Array) {
      let input = chunk;
      if (buffered.length) {
        input = new Uint8Array(buffered.length + chunk.length);
        input.set(buffered);
        input.set(chunk, buffered.length);
        buffered = new Uint8Array(0);
      }
      let offset = 0;
      while (offset < input.length) {
        if (remaining) {
          const size = Math.min(remaining, input.length - offset);
          emit(input.subarray(offset, offset + size));
          offset += size;
          remaining -= size;
          if (!remaining) {
            boundary();
          }
          continue;
        }
        if (line !== undefined) {
          const newline = input.indexOf(10, offset);
          const end = newline === -1 ? input.length : newline + 1;
          const bytes = input.subarray(offset, end);
          if (line === true) {
            emit(bytes);
          } else {
            if (
              line.size + bytes.length >
              markerLength + (newline === -1 ? 0 : 1)
            ) {
              emit(line.header);
              line.parts.forEach(emit);
              emit(bytes);
              line = true;
            } else {
              line.parts.push(bytes.slice());
              line.size += bytes.length;
              if (newline !== -1) {
                const body = new Uint8Array(line.size);
                let position = 0;
                for (const part of line.parts) {
                  body.set(part, position);
                  position += part.length;
                }
                if (
                  consumeMarker(line.id, decoder.decode(body.subarray(0, -1)))
                ) {
                  flushRequested = true;
                } else {
                  emit(line.header);
                  line.parts.forEach(emit);
                }
              }
            }
          }
          offset = end;
          if (newline !== -1) {
            line = undefined;
            boundary();
          }
          continue;
        }
        const colon = input.indexOf(58, offset);
        if (colon === -1 || colon + 1 === input.length) {
          break;
        }
        if (lengthTags.has(input[colon + 1]!)) {
          const comma = input.indexOf(44, colon + 2);
          if (comma === -1) {
            break;
          }
          remaining = parseInt(
            decoder.decode(input.subarray(colon + 2, comma)),
            16,
          );
          emit(input.subarray(offset, comma + 1));
          offset = comma + 1;
          if (!remaining) {
            boundary();
          }
        } else {
          const newline = input.indexOf(10, colon + 1);
          const bodyEnd = newline === -1 ? input.length : newline;
          const body = input.subarray(colon + 1, bodyEnd);
          if (newline === -1) {
            if (body.length > markerLength) {
              line = true;
              emit(input.subarray(offset));
            } else {
              line = {
                id: decoder.decode(input.subarray(offset, colon)),
                header: input.slice(offset, colon + 1),
                parts: [body.slice()],
                size: body.length,
              };
            }
            return;
          }
          if (
            body.length <= markerLength &&
            consumeMarker(
              decoder.decode(input.subarray(offset, colon)),
              decoder.decode(body),
            )
          ) {
            flushRequested = true;
          } else {
            emit(input.subarray(offset, newline + 1));
          }
          offset = newline + 1;
          boundary();
        }
      }
      buffered = input.slice(offset);
    },
  };
}

export function renderWithWeakPromises(
  data: Record<string, unknown>,
  render: (data: Record<string, unknown>) => ReadableStream<Uint8Array>,
  signal?: AbortSignal,
) {
  const entriesByState = new Map<WeakState, Entry>();
  const entriesByMarker = new Map<string, Entry>();
  let markerLength = 0;
  for (const [key, value] of Object.entries(data)) {
    const state = getWeakPromise(value);
    if (!state) {
      continue;
    }
    let entry = entriesByState.get(state);
    if (!entry) {
      const marker = 'waku-weak-' + crypto.randomUUID();
      entry = { placeholder: Promise.resolve(marker) };
      entriesByState.set(state, entry);
      entriesByMarker.set(JSON.stringify(marker), entry);
      markerLength = Math.max(markerLength, JSON.stringify(marker).length);
    }
    data[key] = entry.placeholder;
  }
  if (!entriesByState.size) {
    return render(data);
  }
  const finish = () => {
    signal?.removeEventListener('abort', finish);
    for (const entry of entriesByState.values()) {
      entry.unsubscribe?.();
    }
  };
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = render(data).getReader();
  } catch (error) {
    finish();
    throw error;
  }
  let output: ReadableStreamDefaultController<Uint8Array>;
  let ended = false;
  let enqueued = 0;
  const emit = (bytes: Uint8Array) => {
    enqueued++;
    output.enqueue(bytes);
  };
  const fail = (error: unknown) => {
    if (ended) {
      return;
    }
    ended = true;
    finish();
    output.error(error);
    void reader.cancel(error).catch(() => {});
  };
  const flush = (complete = false) => {
    if (ended || signal?.aborted) {
      return;
    }
    for (const [state, entry] of entriesByState) {
      if (entry.id !== undefined && (state.value !== undefined || complete)) {
        const value = state.value;
        const row =
          value === undefined
            ? '"$undefined"'
            : JSON.stringify(value.startsWith('$') ? '$' + value : value);
        emit(encoder.encode(entry.id + ':' + row + '\n'));
        entriesByState.delete(state);
      }
    }
  };
  const records = forwardFlightRecords(
    emit,
    (id, row) => {
      const entry = entriesByMarker.get(row);
      if (!entry) {
        return false;
      }
      entriesByMarker.delete(row);
      entry.id = id;
      return true;
    },
    () => flush(),
    markerLength,
  );
  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        output = controller;
        for (const [state, entry] of entriesByState) {
          entry.unsubscribe = state.subscribe(() => {
            try {
              records.requestFlush();
            } catch (error) {
              fail(error);
            }
          });
        }
        if (signal?.aborted) {
          finish();
        } else {
          signal?.addEventListener('abort', finish, { once: true });
        }
      },
      async pull() {
        try {
          const before = enqueued;
          do {
            const part = await reader.read();
            if (ended) {
              return;
            }
            if (part.done) {
              records.end();
              finish();
              flush(true);
              ended = true;
              output.close();
              return;
            }
            records.push(part.value);
          } while (enqueued === before);
        } catch (error) {
          fail(error);
        }
      },
      async cancel(reason) {
        ended = true;
        finish();
        await reader.cancel(reason);
      },
    },
    { highWaterMark: 0 },
  );
}
