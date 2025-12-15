const encoder = new TextEncoder()
const decoder = new TextDecoder()

const OVERLAP = '</head>'.length - 1

/**
 * Creates a transform stream that inserts HTML content before </head>.
 * Used for injecting CSS-in-JS styles during streaming SSR.
 */
export function createHeadInsertionTransformStream(
  insert: () => Promise<string> | string,
): TransformStream<Uint8Array, Uint8Array> {
  let found = false
  let pending = ''
  let toInsert = ''

  return new TransformStream({
    async transform(chunk, controller) {
      const content = await insert()

      if (found) {
        if (content) {
          controller.enqueue(encoder.encode(content))
        }
        controller.enqueue(chunk)
        return
      }

      if (content) {
        toInsert += content
      }

      const decoded = decoder.decode(chunk)
      const text = pending ? pending + decoded : decoded
      const idx = text.indexOf('</head>')

      if (idx !== -1) {
        controller.enqueue(
          encoder.encode(text.slice(0, idx) + toInsert + text.slice(idx)),
        )
        found = true
        pending = ''
        toInsert = ''
      } else if (text.length > OVERLAP) {
        // Buffer last chars in case </head> is split across chunks
        controller.enqueue(encoder.encode(text.slice(0, -OVERLAP)))
        pending = text.slice(-OVERLAP)
      } else {
        pending = text
      }
    },
    async flush(controller) {
      const content = await insert()
      const remaining = toInsert + pending + content
      if (remaining) {
        controller.enqueue(encoder.encode(remaining))
      }
    },
  })
}
