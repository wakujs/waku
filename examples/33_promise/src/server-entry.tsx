import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Children, Slot } from 'waku/minimal/client';
import { unstable_createAsyncIterable as createAsyncIterable } from 'waku/server';

import App from './components/App';

export default defineEntries({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      return renderRsc({
        App: (
          <App name={input.rscPath || 'Waku'}>
            <Children />
          </App>
        ),
      });
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml(
        {
          App: (
            <App name="Waku">
              <Children />
            </App>
          ),
        },
        <Slot id="App">
          <h3>A client element</h3>
        </Slot>,
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
