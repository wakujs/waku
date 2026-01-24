import { secureHeaders, NONCE } from 'hono/secure-headers';

const nonceMiddleware = () =>
  secureHeaders({
    contentSecurityPolicy: {
      scriptSrc: [NONCE],
    },
  });

export default nonceMiddleware;
