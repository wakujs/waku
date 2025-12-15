/**
 * Request-scoped storage for server-inserted HTML using AsyncLocalStorage.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export type ServerInsertedHTMLStore = {
  callbacks: Array<() => string>;
};

export const serverInsertedHTMLStorage =
  new AsyncLocalStorage<ServerInsertedHTMLStore>();

export function getServerInsertedHTML(): string {
  const store = serverInsertedHTMLStorage.getStore();
  if (!store) {
    return '';
  }
  return store.callbacks.map((callback) => callback()).join('');
}
