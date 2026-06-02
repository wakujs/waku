import fsPromises from 'node:fs/promises';
import * as cookie from 'cookie';
import { contextStorage, getContext } from 'hono/context-storage';
import adapter from 'waku/adapters/default';
import { unstable_runWithContext as runWithContext } from 'waku/internals';
import { Slot } from 'waku/minimal/client';
import { unstable_getContextData as getContextData } from 'waku/server';
import App from './components/App';

export default adapter(
  {
    handleRequest: (input, { renderRsc, renderHtml }) =>
      runWithContext(input.req, async () => {
        const cookies = cookie.parse(input.req.headers.get('cookie') || '');
        const data = getContextData() as { count?: number };
        data.count = (Number(cookies.count) || 0) + 1;
        const setCookie = cookie.serialize('count', String(data.count));
        const items = JSON.parse(
          await fsPromises.readFile('./private/items.json', 'utf8'),
        );
        if (input.type === 'component') {
          const stream = await renderRsc({
            App: <App name={input.rscPath || 'Waku'} items={items} />,
          });
          return new Response(stream, { headers: { 'set-cookie': setCookie } });
        }
        if (input.type === 'custom' && input.pathname === '/') {
          const response = await renderHtml(
            await renderRsc({ App: <App name={'Waku'} items={items} /> }),
            <Slot id="App" />,
            { rscPath: '' },
          );
          response.headers.append('set-cookie', setCookie);
          return response;
        }
      }),
    handleBuild: async () => {},
  },
  {
    middlewareFns: [contextStorage],
    middlewareModules: import.meta.glob('./middleware/*.ts'),
  },
);

export const getHonoContext = ((globalThis as any).__WAKU_GET_HONO_CONTEXT__ ||=
  getContext);
