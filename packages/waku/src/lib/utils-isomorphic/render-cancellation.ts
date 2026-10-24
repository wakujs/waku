const cancellation = Symbol('waku.render-cancellation');

const CANCEL_RENDER_DIGEST = 'WAKU_CANCEL_RENDER';

/**
 * Recognizes the local signal thrown by `cancelRender`. Server catch blocks
 * must rethrow it to preserve cancellation. Decoded Flight errors use
 * `hasRenderCancellationDigest`.
 */
export function isRenderCancellation(error: unknown): boolean {
  return error === cancellation;
}

/**
 * Recognizes a cancellation after Flight decoding. Custom error boundaries
 * must rethrow it so the enclosing Slot can retain its previous content.
 */
export function hasRenderCancellationDigest(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    error.digest === CANCEL_RENDER_DIGEST
  );
}

export function getDigestIfRenderCancellation(
  error: unknown,
): string | undefined {
  return isRenderCancellation(error) || hasRenderCancellationDigest(error)
    ? CANCEL_RENDER_DIGEST
    : undefined;
}

/**
 * Stops the current server component or function by throwing a cancellation
 * signal. Other render tasks can continue. On the client, a cancelled Slot
 * keeps its previous content, or renders nothing on its first render. During SSR,
 * cancellation uses the nearest Suspense fallback or switches to client rendering.
 * It carries no status or navigation data.
 * Catch blocks and custom error boundaries must rethrow the signal.
 *
 * @example
 * import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
 *
 * if (!allowed) cancelRender();
 */
export function cancelRender(): never {
  throw cancellation;
}

/**
 * Discards a render stream with a cancellation reason recognized by Waku's
 * error handler. Returns the cancellation promise, or undefined for a null body.
 * It does not record a redirect or not-found intent.
 */
export function cancelRenderStream(
  stream: ReadableStream | null,
): Promise<void> | undefined {
  return stream?.cancel(cancellation);
}
