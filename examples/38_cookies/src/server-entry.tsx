import fsPromises from 'node:fs/promises';
import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';
import { getContextData } from 'waku/middleware/context';
import { unstable_createAsyncIterable as createAsyncIterable } from 'waku/server';

import App from './components/App';

export default defineEntries({
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
  handleBuild: () =>
    createAsyncIterable(async () => {
      const tasks = [
        async () => ({
          type: 'htmlHead' as const,
          pathSpec: [],
          head: '',
        }),
      ];
      return tasks;
    }),
});
