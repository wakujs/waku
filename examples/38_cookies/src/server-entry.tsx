import fsPromises from 'node:fs/promises';
import { Slot } from 'waku/minimal/client';
import { unstable_defineServer as defineServer } from 'waku/minimal/server';
import { unstable_getContextData as getContextData } from 'waku/server';
import App from './components/App';

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
});
