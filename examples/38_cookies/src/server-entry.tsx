import fsPromises from 'node:fs/promises';
import { contextStorage, getContext } from 'hono/context-storage';
import adapter from 'waku/adapters/default';
import { Slot } from 'waku/minimal/client';
import { unstable_getContextData as getContextData } from 'waku/server';
import App from './components/App';

export default adapter(
  {
    handleRequest: async (input, { renderRsc, renderHtml, getRscInput }) => {
      const rscInput = await getRscInput(input.req);
      const data = getContextData() as { count?: number };
      data.count = (data.count || 0) + 1;
      const items = JSON.parse(
        await fsPromises.readFile('./private/items.json', 'utf8'),
      );
      if (rscInput?.type === 'component') {
        return renderRsc({
          App: <App name={rscInput.rscPath || 'Waku'} items={items} />,
        });
      }
      if (input.pathname === '/') {
        return renderHtml(
          await renderRsc({ App: <App name={'Waku'} items={items} /> }),
          <Slot id="App" />,
          { rscPath: '' },
        );
      }
    },
    handleBuild: async () => {},
  },
  {
    middlewareFns: [contextStorage],
    middlewareModules: import.meta.glob('./middleware/*.ts'),
  },
);

export const getHonoContext = ((globalThis as any).__WAKU_GET_HONO_CONTEXT__ ||=
  getContext);
