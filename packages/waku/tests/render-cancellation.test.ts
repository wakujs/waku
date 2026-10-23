import { expect, test } from 'vitest';
import {
  cancelRender,
  cancelRenderStream,
  getDigestIfRenderCancellation,
  isRenderCancellation,
} from '../src/lib/utils-isomorphic/render-cancellation.js';

test('a private cancellation symbol and its Flight error share a digest', () => {
  let cancellation: unknown;
  try {
    cancelRender();
  } catch (error) {
    cancellation = error;
  }
  expect(typeof cancellation).toBe('symbol');
  expect(Symbol.keyFor(cancellation as symbol)).toBeUndefined();
  const digest = getDigestIfRenderCancellation(cancellation);
  expect(isRenderCancellation(cancellation)).toBe(true);
  expect(digest).toBe('WAKU_CANCEL_RENDER');
  expect(
    isRenderCancellation(Object.assign(new Error('Flight error'), { digest })),
  ).toBe(true);
  expect(
    getDigestIfRenderCancellation(
      Object.assign(new Error('Flight error'), { digest }),
    ),
  ).toBe(digest);
  expect(
    getDigestIfRenderCancellation(Symbol('waku.render-cancellation')),
  ).toBeUndefined();
  expect(
    getDigestIfRenderCancellation(Symbol.for('waku.render-cancellation')),
  ).toBeUndefined();
  expect(
    getDigestIfRenderCancellation(new Error('application error')),
  ).toBeUndefined();
  expect(isRenderCancellation(new Error('application error'))).toBe(false);
  expect(
    getDigestIfRenderCancellation({ digest: 'unrelated' }),
  ).toBeUndefined();
});

test('discarding a pending stream supplies a recognizable cancellation', async () => {
  const cancelled = Promise.withResolvers<unknown>();
  const stream = new ReadableStream({ cancel: cancelled.resolve });
  await cancelRenderStream(stream);
  expect(getDigestIfRenderCancellation(await cancelled.promise)).toBe(
    'WAKU_CANCEL_RENDER',
  );
  expect(cancelRenderStream(null)).toBeUndefined();
});
