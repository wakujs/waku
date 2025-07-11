/** eslint-disable */
// @ts-nocheck

const encoder = new TextEncoder();
const trailer = '</body></html>';

export function injectRSCPayload(rscStream, options) {
  let decoder = new TextDecoder();
  let resolveFlightDataPromise;
  let flightDataPromise = new Promise((resolve) => resolveFlightDataPromise = resolve);
  let startedRSC = false;
  let nonce = options && typeof options.nonce === 'string' ? options.nonce : undefined;

  // Buffer all HTML chunks enqueued during the current tick of the event loop (roughly)
  // and write them to the output stream all at once. This ensures that we don't generate
  // invalid HTML by injecting RSC in between two partial chunks of HTML.
  let buffered = [];
  let timeout = null;
  function flushBufferedChunks(controller) {
    for (let chunk of buffered) {
      let buf = decoder.decode(chunk, {stream: true});
      if (buf.endsWith(trailer)) {
        buf = buf.slice(0, -trailer.length);
      }
      controller.enqueue(encoder.encode(buf));
    }

    let remaining = decoder.decode();
    if (remaining.length) {
      if (remaining.endsWith(trailer)) {
        remaining = remaining.slice(0, -trailer.length);
      }
      controller.enqueue(encoder.encode(remaining));
    }

    buffered.length = 0;
    timeout = null;
  }

  return new TransformStream({
    transform(chunk, controller) {
      buffered.push(chunk);
      if (timeout) {
        return;
      }

      timeout = setTimeout(async () => {
        flushBufferedChunks(controller);
        if (!startedRSC) {
          startedRSC = true;
          writeRSCStream(rscStream, controller, nonce)
            .catch(err => controller.error(err))
            .then(resolveFlightDataPromise);
        }
      }, 0);
    },
    async flush(controller) {
      await flightDataPromise;
      if (timeout) {
        clearTimeout(timeout);
        flushBufferedChunks(controller);
      }
      controller.enqueue(encoder.encode(trailer));
    }
  });
}

async function writeRSCStream(rscStream, controller, nonce) {
  let decoder = new TextDecoder('utf-8', {fatal: true});
  for await (let chunk of rscStream) {
    // Try decoding the chunk to send as a string.
    // If that fails (e.g. binary data that is invalid unicode), write as base64.
    try {
      writeChunk(JSON.stringify(decoder.decode(chunk, {stream: true})), controller, nonce);
    } catch (err) {
      let base64 = JSON.stringify(btoa(String.fromCodePoint(...chunk)));
      writeChunk(`Uint8Array.from(atob(${base64}), m => m.codePointAt(0))`, controller, nonce);
    }
  }

  let remaining = decoder.decode();
  if (remaining.length) {
    writeChunk(JSON.stringify(remaining), controller, nonce);
  }
}

function writeChunk(chunk, controller, nonce) {
  controller.enqueue(encoder.encode(`<script${nonce ? ` nonce="${nonce}"` : ""}>${escapeScript(`(self.__FLIGHT_DATA||=[]).push(${chunk})`)}</script>`));
}

// Escape closing script tags and HTML comments in JS content.
// https://www.w3.org/TR/html52/semantics-scripting.html#restrictions-for-contents-of-script-elements
// Avoid replacing </script with <\/script as it would break the following valid JS: 0</script/ (i.e. regexp literal).
// Instead, escape the s character.
function escapeScript(script) {
  return script
    .replace(/<!--/g, '<\\!--')
    .replace(/<\/(script)/gi, '</\\$1');
}
