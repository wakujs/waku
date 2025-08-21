import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Children, Slot } from 'waku/minimal/client';
import { unstable_createAsyncIterable as createAsyncIterable } from 'waku/server';

import App from './components/App';
import Dynamic from './components/Dynamic';

export default defineEntries({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      if (input.rscPath === '') {
        return renderRsc({
          App: <App name={input.rscPath || 'Waku'} />,
        });
      }
      if (input.rscPath === 'dynamic-slices') {
        return renderRsc({
          'slice:dynamic': (
            <Dynamic>
              <Children />
            </Dynamic>
          ),
        });
      }
      throw new Error('Unexpected rscPath: ' + input.rscPath);
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml({ App: <App name="Waku" /> }, <Slot id="App" />, {
        rscPath: '',
      });
    }
  },
  handleBuild: ({ renderRsc, renderHtml, rscPath2pathname }) =>
    createAsyncIterable(async () => {
      const tasks = [
        async () => ({
          type: 'file' as const,
          pathname: rscPath2pathname(''),
          body: renderRsc({ App: <App name="Waku" /> }),
        }),
        async () => ({
          type: 'file' as const,
          pathname: '/',
          body: renderHtml({ App: <App name="Waku" /> }, <Slot id="App" />, {
            rscPath: '',
          }).then((res) => res.body || ''),
        }),
      ];
      return tasks;
    }),
});
