import { concatUint8Array } from '../utils-isomorphic/stream.js';
import { getWeakPromise } from './weak-promise.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const lengthTags = new Set(
  Array.from('TAOoUSsLlGgMmVb', (tag) => tag.charCodeAt(0)),
);
const MARKER_PREFIX = 'waku-weak-';
const MARKER_BODY_LENGTH = MARKER_PREFIX.length + 36 + 2;

type WeakState = NonNullable<ReturnType<typeof getWeakPromise>>;
type Entry = {
  placeholder: Promise<string>;
  id?: string;
  unsubscribe?: () => void;
};

function createFlightRecordScanner(
  emit: (bytes: Uint8Array) => void,
  consumeMarker: (id: string, row: string) => boolean,
  onBoundary: () => void,
) {
  let buffered = new Uint8Array(0);
  let rowParts: Uint8Array[] = [];
  let remaining = 0;
  return {
    isOutputAtBoundary() {
      return !remaining;
    },
    end() {
      if (buffered.length || remaining || rowParts.length) {
        throw new Error('Truncated Flight record');
      }
    },
    push(chunk: Uint8Array) {
      const input = buffered.length
        ? concatUint8Array([buffered, chunk])
        : chunk;
      buffered = new Uint8Array(0);
      let offset = 0;
      while (offset < input.length) {
        if (remaining) {
          const size = Math.min(remaining, input.length - offset);
          emit(input.subarray(offset, offset + size));
          offset += size;
          remaining -= size;
          if (!remaining) {
            onBoundary();
          }
          continue;
        }
        if (!rowParts.length) {
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
              onBoundary();
            }
            continue;
          }
        }
        const newline = input.indexOf(10, offset);
        if (newline === -1) {
          rowParts.push(input.slice(offset));
          return;
        }
        rowParts.push(input.subarray(offset, newline + 1));
        const row = concatUint8Array(rowParts);
        rowParts = [];
        const colon = row.indexOf(58);
        const body = row.subarray(colon + 1, -1);
        if (
          body.length !== MARKER_BODY_LENGTH ||
          !consumeMarker(
            decoder.decode(row.subarray(0, colon)),
            decoder.decode(body),
          )
        ) {
          emit(row);
        }
        offset = newline + 1;
        onBoundary();
      }
      buffered = input.slice(offset);
    },
  };
}

/**
 * Input buffers may be transferred; upstream transforms must give each chunk
 * its own backing buffer.
 */
export function renderWithWeakPromises(
  data: Record<string, unknown>,
  render: (data: Record<string, unknown>) => ReadableStream<Uint8Array>,
) {
  const entriesByState = new Map<WeakState, Entry>();
  const entriesByMarker = new Map<string, Entry>();
  for (const [key, value] of Object.entries(data)) {
    const state = getWeakPromise(value);
    if (!state) {
      continue;
    }
    let entry = entriesByState.get(state);
    if (!entry) {
      const marker = MARKER_PREFIX + crypto.randomUUID();
      entry = { placeholder: Promise.resolve(marker) };
      entriesByState.set(state, entry);
      entriesByMarker.set(JSON.stringify(marker), entry);
    }
    data[key] = entry.placeholder;
  }
  if (!entriesByState.size) {
    return render(data);
  }
  const finish = () => {
    for (const entry of entriesByState.values()) {
      entry.unsubscribe?.();
    }
  };
  const reader = render(data).getReader();
  let output: ReadableByteStreamController;
  let ended = false;
  let outputChunks: Uint8Array[] | undefined;
  const emit = (bytes: Uint8Array) => {
    if (outputChunks) {
      outputChunks.push(bytes);
    } else {
      output.enqueue(bytes as Uint8Array<ArrayBuffer>);
    }
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
    if (ended) {
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
  const records = createFlightRecordScanner(
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
    flush,
  );
  return new ReadableStream({
    type: 'bytes',
    async start(controller) {
      output = controller;
      for (const [state, entry] of entriesByState) {
        entry.unsubscribe = state.subscribe(() => {
          try {
            if (records.isOutputAtBoundary()) {
              flush();
            }
          } catch (error) {
            fail(error);
          }
        });
      }
      try {
        while (true) {
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
            output.byobRequest?.respond(0);
            return;
          }
          outputChunks = [];
          records.push(part.value);
          if (outputChunks.length) {
            output.enqueue(
              concatUint8Array(outputChunks) as Uint8Array<ArrayBuffer>,
            );
          }
          outputChunks = undefined;
        }
      } catch (error) {
        fail(error);
      }
    },
    async cancel(reason) {
      ended = true;
      finish();
      await reader.cancel(reason);
    },
  });
}
