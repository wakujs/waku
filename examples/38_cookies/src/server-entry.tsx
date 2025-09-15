import fsPromises from 'node:fs/promises';
import { Hono } from 'hono';
import { contextStorage, getContext } from 'hono/context-storage';
import { unstable_defineServer as defineServer } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';
import {
  unstable_getContextData as getContextData,
  unstable_engine as engine,
} from 'waku/server';

import App from './components/App';
import cookieMiddleware from './middleware/cookie';
import noopMiddleware from './middleware/noop';

export default defineServer({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    const data = getContextData() as { count?: number };
    data.count = (data.count || 0) + 1;
    const items = JSON.parse(
      await fsPromises.readFile('./private/items.json', 'utf8'),
    );
    if (input.type === 'component') {
      return renderRsc({
        App: <App name={input.rscPath || 'Waku'} items={items} />,
      });
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml(
        { App: <App name={'Waku'} items={items} /> },
        <Slot id="App" />,
        { rscPath: '' },
      );
    }
  },
  handleBuild: async () => {},
  createFetch: (args) => {
    const app = new Hono();
    app.use(contextStorage());
    app.use(engine.contextMiddleware());
    app.use(cookieMiddleware());
    app.use(noopMiddleware());
    app.use(engine.staticMiddleware(args));
    app.use(engine.rscMiddleware(args));
    app.use(engine.notFoundMiddleware(args));
    return async (req) => app.fetch(req);
  },
});

export const getHonoContext = ((globalThis as any).__WAKU_GET_HONO_CONTEXT__ ||=
  getContext);
