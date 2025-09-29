import { Slot } from 'waku/minimal/client';
import { nodeAdapter } from 'waku/adapters/node';

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

export default nodeAdapter({
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
  handleBuild: async () => {},
});
