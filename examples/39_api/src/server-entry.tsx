import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';
import { unstable_createAsyncIterable as createAsyncIterable } from 'waku/server';

import App from './components/App';

const stringToStream = (str: string): ReadableStream => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(str));
      controller.close();
    },
  });
};

export default defineEntries({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      return renderRsc({ App: <App name={input.rscPath || 'Waku'} /> });
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml({ App: <App name="Waku" /> }, <Slot id="App" />, {
        rscPath: '',
      });
    }
    if (input.type === 'custom' && input.pathname === '/api/hello') {
      return stringToStream('world');
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
