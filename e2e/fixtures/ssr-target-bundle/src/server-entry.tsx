import { unstable_defineServer as defineServer } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';
import { unstable_engine as engine } from 'waku/server';

import App from './components/App.js';

const entries: ReturnType<typeof defineServer> = defineServer({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      return renderRsc({ App: <App name={input.rscPath || 'Waku'} /> });
    }
    if (input.type === 'function') {
      const value = await input.fn(...input.args);
      return renderRsc({ _value: value });
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml({ App: <App name="Waku" /> }, <Slot id="App" />, {
        rscPath: '',
      });
    }
  },
  handleBuild: async () => {},
  createFetch: engine.createFetch,
});

export default entries;
