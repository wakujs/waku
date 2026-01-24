import type { ContentSecurityPolicyOptionHandler } from 'hono/secure-headers';
import { secureHeaders } from 'hono/secure-headers';

// Fixed nonce for testing purposes
const TEST_NONCE = 'test-nonce-middleware-12345';

const customNonceGenerator: ContentSecurityPolicyOptionHandler = (c) => {
  c.set('secureHeadersNonce', TEST_NONCE);
  return `'nonce-${TEST_NONCE}'`;
};

const nonceMiddleware = () =>
  secureHeaders({
    contentSecurityPolicy: {
      scriptSrc: [customNonceGenerator],
    },
  });

export default nonceMiddleware;
