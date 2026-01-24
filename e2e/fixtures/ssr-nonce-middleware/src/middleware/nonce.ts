import type { MiddlewareHandler } from 'hono';
import { NONCE, secureHeaders } from 'hono/secure-headers';
import { unstable_getContext as getContext } from 'waku/server';

const nonceMiddleware = (): MiddlewareHandler => {
  const secure = secureHeaders({
    contentSecurityPolicy: {
      scriptSrc: ["'self'", NONCE],
    },
  });

  return async (c, next) => {
    await secure(c, async () => {
      // Bridge Hono's nonce to Waku
      const nonce = c.get('secureHeadersNonce');
      if (nonce) {
        const context = getContext();
        context.nonce = nonce;
      }
      await next();
    });
  };
};

export default nonceMiddleware;
