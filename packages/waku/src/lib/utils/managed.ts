export const getManagedServerEntry = () => {
  return `
import { unstable_fsRouter as fsRouter } from 'waku/router/server';
import { nodeAdapter } from 'waku/adapters/node';

export default nodeAdapter(fsRouter());
`;
};

export const getManagedClientEntry = () => {
  return `
import { StrictMode, createElement } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Router } from 'waku/router/client';

const rootElement = createElement(StrictMode, null, createElement(Router));

if (globalThis.__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement);
} else {
  createRoot(document).render(rootElement);
}
`;
};
