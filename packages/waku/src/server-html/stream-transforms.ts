/**
 * Stream transform utilities for SSR streaming.
 * These utilities enable injection of server-inserted HTML (like CSS-in-JS styles)
 * into the HTML stream at the appropriate location.
 */

// Shared encoder instance (safe to share as TextEncoder is stateless)
const encoder = new TextEncoder();

// Encoded closing head tag for searching
const ENCODED_CLOSING_HEAD = encoder.encode('</head>');

/**
 * Finds the index of a byte sequence within a Uint8Array.
 */
function indexOfUint8Array(
  source: Uint8Array,
  search: Uint8Array,
  fromIndex = 0,
): number {
  const searchLength = search.length;
  const sourceLength = source.length;

  if (searchLength === 0) {
    return fromIndex;
  }
  if (searchLength > sourceLength) {
    return -1;
  }

  outer: for (let i = fromIndex; i <= sourceLength - searchLength; i++) {
    for (let j = 0; j < searchLength; j++) {
      if (source[i + j] !== search[j]) {
        continue outer;
      }
    }
    return i;
  }

  return -1;
}

/**
 * Creates a transform stream that inserts HTML content before the closing </head> tag.
 *
 * This is used for injecting server-inserted HTML during streaming SSR,
 * such as CSS-in-JS styles from libraries like styled-components or Emotion.
 *
 * The insertion function is called:
 * - Before each chunk is enqueued (to collect newly registered content)
 * - On flush (to handle any remaining content)
 *
 * @param insert - Async function that returns HTML string to insert
 */
export function createHeadInsertionTransformStream(
  insert: () => Promise<string> | string,
): TransformStream<Uint8Array, Uint8Array> {
  let inserted = false;
  // Track if we've seen any bytes - if not, we don't want to insert anything
  let hasBytes = false;

  return new TransformStream({
    async transform(chunk, controller) {
      hasBytes = true;

      const insertion = await insert();

      if (inserted) {
        // Already found </head>, just pass through
        if (insertion) {
          controller.enqueue(encoder.encode(insertion));
        }
        controller.enqueue(chunk);
        return;
      }

      // Look for </head> in this chunk
      const index = indexOfUint8Array(chunk, ENCODED_CLOSING_HEAD);

      if (index !== -1) {
        // Found </head>
        if (insertion) {
          const encodedInsertion = encoder.encode(insertion);
          // Create new array: [before </head>] + [insertion] + [</head> onwards]
          const result = new Uint8Array(
            chunk.length + encodedInsertion.length,
          );
          // Copy bytes before </head>
          result.set(chunk.slice(0, index));
          // Insert the server-inserted HTML
          result.set(encodedInsertion, index);
          // Copy </head> and everything after
          result.set(chunk.slice(index), index + encodedInsertion.length);
          controller.enqueue(result);
        } else {
          controller.enqueue(chunk);
        }
        inserted = true;
      } else {
        // No </head> found in this chunk
        // This can happen with PPR or when the head is split across chunks
        // In this case, we insert before the chunk and pass it through
        if (insertion) {
          controller.enqueue(encoder.encode(insertion));
        }
        controller.enqueue(chunk);
        inserted = true;
      }
    },
    async flush(controller) {
      // Check if there's anything remaining to insert at the end
      if (hasBytes) {
        const insertion = await insert();
        if (insertion) {
          controller.enqueue(encoder.encode(insertion));
        }
      }
    },
  });
}

/**
 * Converts a ReadableStream to a string.
 * Useful for rendering React elements to string on the server.
 */
export async function streamToString(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let result = '';

  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  return result;
}
