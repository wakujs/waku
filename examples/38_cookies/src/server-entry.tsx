import fsPromises from 'node:fs/promises';
import { Hono } from 'hono';
import { contextStorage, getContext } from 'hono/context-storage';
import { unstable_honoMiddleware as honoMiddleware } from 'waku/internals';
import { Slot } from 'waku/minimal/client';
import { unstable_defineServer as defineServer } from 'waku/minimal/server';
import { unstable_getContextData as getContextData } from 'waku/server';
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
  createApp: (args, baseApp) => {
    const app = baseApp instanceof Hono ? (baseApp as Hono) : new Hono();
    app.use(contextStorage());
    app.use(honoMiddleware.contextMiddleware());
    app.use(cookieMiddleware());
    app.use(noopMiddleware());
    app.use(honoMiddleware.rscMiddleware(args));
    return app;
  },
});

export const getHonoContext = ((globalThis as any).__WAKU_GET_HONO_CONTEXT__ ||=
  getContext);
