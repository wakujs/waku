import type { MiddlewareHandler } from 'hono';

// Fixed nonce for testing purposes
const TEST_NONCE = 'test-nonce-middleware-12345';

const nonceMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    // Store nonce in context for potential use
    c.set('nonce', TEST_NONCE);

    // Inject x-waku-nonce header by cloning the request
    const headers = new Headers(c.req.raw.headers);
    headers.set('x-waku-nonce', TEST_NONCE);
    const reqWithNonce = new Request(c.req.raw.url, {
      method: c.req.raw.method,
      headers,
      body: c.req.raw.body,
      duplex: 'half',
    } as RequestInit);
    (c.req as { raw: Request }).raw = reqWithNonce;

    await next();

    // Add CSP header to response
    c.res.headers.set(
      'Content-Security-Policy',
      `script-src 'nonce-${TEST_NONCE}' 'strict-dynamic';`,
    );
  };
};

export default nonceMiddleware;
