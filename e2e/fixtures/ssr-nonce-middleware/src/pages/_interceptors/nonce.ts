import { getContext } from 'hono/context-storage';
import type { HandlerInterceptor } from 'waku/router/server';
import { unstable_setNonce as setNonce } from 'waku/router/server';

const nonceInterceptor: HandlerInterceptor = (next) => {
  const nonce = getContext().get('secureHeadersNonce');
  if (typeof nonce === 'string') {
    setNonce(nonce);
  }
  return next();
};

export default nonceInterceptor;
