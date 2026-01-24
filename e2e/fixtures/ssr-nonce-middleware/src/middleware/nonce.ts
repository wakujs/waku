import type { MiddlewareHandler } from 'hono';
import { secureHeaders, NONCE } from 'hono/secure-headers';
import { unstable_setNonce } from 'waku/router/server';

const nonceMiddleware = (): MiddlewareHandler => {
  const secure = secureHeaders({
    contentSecurityPolicy: {
      scriptSrc: [NONCE],
    },
  });

  return async (c, next) => {
    await secure(c, async () => {
      // Bridge Hono's nonce to Waku
      const nonce = c.get('secureHeadersNonce');
      if (nonce) {
        unstable_setNonce(nonce);
      }
      await next();
    });
  };
};

export default nonceMiddleware;
