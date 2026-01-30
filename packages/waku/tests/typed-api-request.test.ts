import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';
import { describe, expect, it } from 'vitest';
import { getPathMapping, parsePathWithSlug } from '../src/lib/utils/path.js';
import type { ApiParams, TypedRequest } from '../src/router/common.js';

/**
 * Tests for TypedRequest<Path> - typed API route parameters
 *
 * TypedRequest extends the standard Request interface with a typed `params`
 * property that extracts route parameters from the path pattern.
 *
 * @see https://github.com/wakujs/waku/issues/1906
 */

describe('ApiParams type tests', () => {
  it('extracts single slug parameter', () => {
    type Params = ApiParams<'/users/[id]'>;
    expectType<TypeEqual<Params, { id: string }>>(true);
  });

  it('extracts multiple slug parameters', () => {
    type Params = ApiParams<'/users/[userId]/posts/[postId]'>;
    expectType<TypeEqual<Params, { userId: string; postId: string }>>(true);
  });

  it('extracts wildcard parameter as string array', () => {
    type Params = ApiParams<'/files/[...path]'>;
    expectType<TypeEqual<Params, { path: string[] }>>(true);
  });

  it('extracts mixed slug and wildcard parameters', () => {
    type Params = ApiParams<'/users/[id]/files/[...path]'>;
    expectType<TypeEqual<Params, { id: string; path: string[] }>>(true);
  });

  it('returns empty object for paths without parameters', () => {
    type Params = ApiParams<'/users'>;
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    expectType<TypeEqual<Params, {}>>(true);
  });

  it('handles root path', () => {
    type Params = ApiParams<'/'>;
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    expectType<TypeEqual<Params, {}>>(true);
  });

  it('handles nested paths with single parameter', () => {
    type Params = ApiParams<'/api/v1/items/[itemId]'>;
    expectType<TypeEqual<Params, { itemId: string }>>(true);
  });

  it('handles wildcard at root level', () => {
    type Params = ApiParams<'/[...slug]'>;
    expectType<TypeEqual<Params, { slug: string[] }>>(true);
  });
});

describe('TypedRequest type tests', () => {
  it('extends Request with typed params for single slug', () => {
    type Req = TypedRequest<'/users/[id]'>;

    // Should have params property
    expectType<Req['params']>({ id: 'test-id' });

    // Params should be correctly typed
    type ParamsType = Req['params'];
    expectType<TypeEqual<ParamsType, { id: string }>>(true);
  });

  it('extends Request with typed params for multiple slugs', () => {
    type Req = TypedRequest<'/users/[userId]/posts/[postId]'>;

    expectType<Req['params']>({ userId: 'user-1', postId: 'post-1' });

    type ParamsType = Req['params'];
    expectType<TypeEqual<ParamsType, { userId: string; postId: string }>>(true);
  });

  it('extends Request with typed params for wildcard', () => {
    type Req = TypedRequest<'/files/[...path]'>;

    expectType<Req['params']>({ path: ['folder', 'subfolder', 'file.txt'] });

    type ParamsType = Req['params'];
    expectType<TypeEqual<ParamsType, { path: string[] }>>(true);
  });

  it('extends Request with typed params for mixed slug and wildcard', () => {
    type Req = TypedRequest<'/users/[id]/files/[...path]'>;

    expectType<Req['params']>({ id: 'user-1', path: ['docs', 'readme.md'] });

    type ParamsType = Req['params'];
    expectType<TypeEqual<ParamsType, { id: string; path: string[] }>>(true);
  });

  it('has empty params object for paths without parameters', () => {
    type Req = TypedRequest<'/users'>;

    expectType<Req['params']>({});

    type ParamsType = Req['params'];
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    expectType<TypeEqual<ParamsType, {}>>(true);
  });

  it('preserves Request methods and properties', () => {
    // This test ensures TypedRequest extends Request properly
    const handler = async (req: TypedRequest<'/users/[id]'>) => {
      // Should have access to standard Request properties
      expectType<string>(req.url);
      expectType<string>(req.method);
      expectType<Headers>(req.headers);
      expectType<ReadableStream<Uint8Array> | null>(req.body);

      // Should have access to standard Request methods
      expectType<Request>(req.clone());
      expectType<Promise<string>>(req.text());
      expectType<Promise<unknown>>(req.json());
      expectType<Promise<ArrayBuffer>>(req.arrayBuffer());

      // Should have typed params
      const { id } = req.params;
      expectType<string>(id);

      return new Response(`User: ${id}`);
    };

    // Type check passes if this compiles
    expectType<(req: TypedRequest<'/users/[id]'>) => Promise<Response>>(
      handler,
    );
  });

  it('is backwards compatible with plain Request handlers', () => {
    // A handler that accepts TypedRequest should also work in contexts
    // expecting a plain Request handler, since TypedRequest extends Request
    const typedHandler = async (req: TypedRequest<'/users/[id]'>) => {
      return new Response(`User: ${req.params.id}`);
    };

    // The handler function type should be assignable where Request is expected
    // (params will just be ignored by code that doesn't know about it)
    type HandlerFn = (req: Request) => Promise<Response>;

    // This should compile - TypedRequest extends Request
    const _fn: HandlerFn = typedHandler as HandlerFn;
    expectType<HandlerFn>(_fn);
  });
});

describe('TypedRequest usage patterns', () => {
  it('works with destructuring in handler', () => {
    const handler = async (
      req: TypedRequest<'/posts/[postId]/comments/[commentId]'>,
    ) => {
      const { postId, commentId } = req.params;
      expectType<string>(postId);
      expectType<string>(commentId);
      return new Response(`Post ${postId}, Comment ${commentId}`);
    };

    expectType<
      (
        req: TypedRequest<'/posts/[postId]/comments/[commentId]'>,
      ) => Promise<Response>
    >(handler);
  });

  it('works with wildcard destructuring', () => {
    const handler = async (req: TypedRequest<'/api/[...segments]'>) => {
      const { segments } = req.params;
      expectType<string[]>(segments);
      return new Response(`Segments: ${segments.join('/')}`);
    };

    expectType<(req: TypedRequest<'/api/[...segments]'>) => Promise<Response>>(
      handler,
    );
  });

  it('allows accessing both Request properties and params', () => {
    const handler = async (req: TypedRequest<'/users/[id]'>) => {
      const url = new URL(req.url);
      const { id } = req.params;
      const authHeader = req.headers.get('Authorization');

      expectType<string>(id);
      expectType<URL>(url);
      expectType<string | null>(authHeader);

      return new Response(JSON.stringify({ id, path: url.pathname }));
    };

    expectType<(req: TypedRequest<'/users/[id]'>) => Promise<Response>>(
      handler,
    );
  });
});

describe('Runtime params extraction', () => {
  it('extracts single slug parameter', () => {
    const pathSpec = parsePathWithSlug('/users/[id]');
    const params = getPathMapping(pathSpec, '/users/123');
    expect(params).toEqual({ id: '123' });
  });

  it('extracts multiple slug parameters', () => {
    const pathSpec = parsePathWithSlug('/users/[userId]/posts/[postId]');
    const params = getPathMapping(pathSpec, '/users/abc/posts/xyz');
    expect(params).toEqual({ userId: 'abc', postId: 'xyz' });
  });

  it('extracts wildcard parameter as array', () => {
    const pathSpec = parsePathWithSlug('/files/[...path]');
    const params = getPathMapping(pathSpec, '/files/folder/subfolder/file.txt');
    expect(params).toEqual({ path: ['folder', 'subfolder', 'file.txt'] });
  });

  it('extracts mixed slug and wildcard parameters', () => {
    const pathSpec = parsePathWithSlug('/users/[id]/files/[...path]');
    const params = getPathMapping(
      pathSpec,
      '/users/user-1/files/docs/readme.md',
    );
    expect(params).toEqual({ id: 'user-1', path: ['docs', 'readme.md'] });
  });

  it('returns empty object for paths without parameters', () => {
    const pathSpec = parsePathWithSlug('/users');
    const params = getPathMapping(pathSpec, '/users');
    expect(params).toEqual({});
  });

  it('handles empty wildcard', () => {
    const pathSpec = parsePathWithSlug('/[...slug]');
    const params = getPathMapping(pathSpec, '/');
    expect(params).toEqual({ slug: [] });
  });
});
