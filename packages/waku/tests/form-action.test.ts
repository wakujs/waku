import { describe, expect, it, vi } from 'vitest';
import {
  addFormActionMarker,
  createFormActionEncoder,
  hasFormActionMarker,
} from '../src/lib/utils/form-action.js';

const encodeReplyMock = async (value: unknown) => {
  const { id, bound } = value as { id: string; bound: Promise<unknown[]> };
  const data = new FormData();
  data.append('0', JSON.stringify({ id, bound: '$@1' }));
  data.append('1', JSON.stringify(await bound));
  return data;
};

const makeFlightChunk = (value: unknown[]): Promise<unknown[]> =>
  Object.assign(Promise.resolve(value), { status: 'fulfilled', value });

const renderUntilSettled = async (
  encode: ReturnType<typeof createFormActionEncoder>,
  actionId: string,
  makeBoundPromise: () => Promise<unknown[]>,
) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return encode(actionId, makeBoundPromise());
    } catch (thrown) {
      if (
        !thrown ||
        typeof (thrown as { then?: unknown }).then !== 'function'
      ) {
        throw thrown;
      }
      await new Promise<void>((resolve) =>
        (thrown as PromiseLike<void>).then(
          () => resolve(),
          () => resolve(),
        ),
      );
    }
  }
  throw new Error('did not converge within the suspension budget');
};

describe('form action marker', () => {
  it('adds and detects the marker, preserving an existing query', () => {
    expect(addFormActionMarker('/foo', '')).toBe('/foo?__waku_action=1');
    expect(addFormActionMarker('/foo', '?a=1')).toBe(
      '/foo?a=1&__waku_action=1',
    );
    expect(
      hasFormActionMarker(new URL('https://a.test/foo?a=1&__waku_action=1')),
    ).toBe(true);
    expect(hasFormActionMarker(new URL('https://a.test/foo?a=1'))).toBe(false);
  });

  it('is idempotent for already-marked queries', () => {
    expect(addFormActionMarker('/foo', '?__waku_action=1')).toBe(
      '/foo?__waku_action=1',
    );
    expect(addFormActionMarker('/foo', '?a=1&__waku_action=1')).toBe(
      '/foo?a=1&__waku_action=1',
    );
    const once = addFormActionMarker('/foo', '?a=1');
    const twice = addFormActionMarker('/foo', once.slice(once.indexOf('?')));
    expect(twice).toBe(once);
  });
});

describe('createFormActionEncoder', () => {
  it('serves unbound references synchronously despite unstable promise identity', async () => {
    const encode = createFormActionEncoder(() => '/p?__waku_action=1', vi.fn());
    const fields = await renderUntilSettled(encode, 'act#a', () =>
      Promise.resolve([]),
    );
    expect(fields).toEqual({
      name: '$ACTION_ID_act#a',
      method: 'POST',
      encType: 'multipart/form-data',
      data: null,
      action: '/p?__waku_action=1',
    });
    // subsequent calls (fresh promise each time) are served without suspension
    expect(encode('act#a', Promise.resolve([]))).toMatchObject({
      name: '$ACTION_ID_act#a',
    });
  });

  it('serves payload-bound references with prefixed reply fields', async () => {
    const encode = createFormActionEncoder(
      () => '/p?__waku_action=1',
      encodeReplyMock,
    );
    const chunk = makeFlightChunk([42, 'hello']);
    const fields = await renderUntilSettled(encode, 'act#a', () => chunk);
    expect(fields.name).toMatch(/^\$ACTION_REF_/);
    expect(fields.action).toBe('/p?__waku_action=1');
    const prefix = fields.name!.slice('$ACTION_REF_'.length);
    const entries = [...fields.data!.entries()];
    expect(entries).toEqual([
      [`$ACTION_${prefix}:0`, JSON.stringify({ id: 'act#a', bound: '$@1' })],
      [`$ACTION_${prefix}:1`, JSON.stringify([42, 'hello'])],
    ]);
  });

  it('serves client-side bound references via their stable promise identity', async () => {
    const encode = createFormActionEncoder(
      () => '/p?__waku_action=1',
      encodeReplyMock,
    );
    const stableBound = Promise.resolve([7]);
    const fields = await renderUntilSettled(encode, 'act#a', () => stableBound);
    expect(fields.name).toMatch(/^\$ACTION_REF_/);
    expect([...fields.data!.values()][1]).toBe(JSON.stringify([7]));
  });

  it('assigns a distinct field namespace to every served form', async () => {
    const encode = createFormActionEncoder(
      () => '/p?__waku_action=1',
      encodeReplyMock,
    );
    const chunk = makeFlightChunk([1]);
    const a = await renderUntilSettled(encode, 'act#a', () => chunk);
    const b = encode('act#a', chunk);
    expect(a.name).toMatch(/^\$ACTION_REF_/);
    expect(b.name).toMatch(/^\$ACTION_REF_/);
    expect(a.name).not.toBe(b.name);
  });

  it('warns when dual usage drops bound arguments (known limitation)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const encode = createFormActionEncoder(
        () => '/p?__waku_action=1',
        encodeReplyMock,
      );
      await renderUntilSettled(encode, 'act#a', () => Promise.resolve([]));
      // first call for a client-side bound form of the same action, arriving
      // after the unbound usage resolved, is served the unbound shape
      const fields = encode('act#a', Promise.resolve([99]));
      expect(fields).toMatchObject({ name: '$ACTION_ID_act#a', data: null });
      await new Promise((resolve) => setTimeout(resolve));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toContain('act#a');
    } finally {
      warn.mockRestore();
    }
  });
});
