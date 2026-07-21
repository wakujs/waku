import { describe, expect, it, vi } from 'vitest';
import {
  getHeaders,
  getNonce,
  getRequest,
  getRerender,
  getResolveSearchCodec,
  getRscParams,
  getRscPath,
  runWithRouterContext,
  setNonce,
  setRerender,
  setRscParams,
  setRscPath,
} from '../src/router/define-router-utils/request-context.js';

const makeRequest = (url = 'http://localhost:3000/', init?: RequestInit) =>
  new Request(url, init);

describe('request-context', () => {
  it('getRequest throws outside a router context', () => {
    expect(() => getRequest()).toThrow('Request is not available.');
  });

  it('getRequest returns the current request inside a context', () => {
    const req = makeRequest();
    expect(runWithRouterContext({ req }, () => getRequest())).toBe(req);
  });

  it('getHeaders reads the request headers as a plain object', () => {
    const req = makeRequest('http://localhost:3000/', {
      headers: { 'x-test': 'value' },
    });
    const headers = runWithRouterContext({ req }, () => getHeaders());
    expect(headers['x-test']).toBe('value');
  });

  it('nested async work sees the same request context', async () => {
    const req = makeRequest();
    const seen = await runWithRouterContext({ req }, async () => {
      await Promise.resolve();
      return (async () => {
        await Promise.resolve();
        return getRequest();
      })();
    });
    expect(seen).toBe(req);
  });

  it('rsc path and params can be set and read within one context', () => {
    const req = makeRequest();
    const result = runWithRouterContext({ req }, () => {
      setRscPath('R/foo');
      setRscParams({ query: 'a=1' });
      return { rscPath: getRscPath(), rscParams: getRscParams() };
    });
    expect(result).toEqual({ rscPath: 'R/foo', rscParams: { query: 'a=1' } });
  });

  it('rsc path and params are undefined without a context', () => {
    expect(getRscPath()).toBeUndefined();
    expect(getRscParams()).toBeUndefined();
  });

  it('context state does not leak between two concurrent contexts', async () => {
    const run = (req: Request, path: string, delay: number) =>
      runWithRouterContext({ req }, async () => {
        setRscPath(path);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return getRscPath();
      });
    const [a, b] = await Promise.all([
      run(makeRequest('http://localhost:3000/a'), 'A', 20),
      run(makeRequest('http://localhost:3000/b'), 'B', 5),
    ]);
    expect(a).toBe('A');
    expect(b).toBe('B');
  });

  it('getRerender throws until a rerender is set, then returns it', () => {
    const req = makeRequest();
    runWithRouterContext({ req }, () => {
      expect(() => getRerender()).toThrow('Rerender is not available.');
      const rerender = vi.fn();
      setRerender(rerender);
      getRerender()('R/x');
      expect(rerender).toHaveBeenCalledWith('R/x');
    });
  });

  it('nonce round-trips within a context', () => {
    const req = makeRequest();
    const nonce = runWithRouterContext({ req }, () => {
      setNonce('nonce-1');
      return getNonce();
    });
    expect(nonce).toBe('nonce-1');
  });

  it('getResolveSearchCodec returns the resolver provided to the context', () => {
    const req = makeRequest();
    const resolveSearchCodec = vi.fn(() => undefined);
    const resolver = runWithRouterContext({ req, resolveSearchCodec }, () =>
      getResolveSearchCodec(),
    );
    expect(resolver).toBe(resolveSearchCodec);
  });

  it('setters are no-ops outside a context', () => {
    expect(() => setRscPath('R/x')).not.toThrow();
    expect(() => setNonce('n')).not.toThrow();
    expect(getRscPath()).toBeUndefined();
  });
});
