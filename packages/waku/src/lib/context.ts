import { AsyncLocalStorage } from 'node:async_hooks';

const requestStorage = new AsyncLocalStorage<Request>();

/**
 * This is an internal function and not for public use.
 */
export function runWithRequest<T>(req: Request, next: () => T): T {
  return requestStorage.run(req, next);
}

export function getRequest(): Request {
  const req = requestStorage.getStore();
  if (!req) {
    throw new Error('Request is not available.');
  }
  return req;
}
