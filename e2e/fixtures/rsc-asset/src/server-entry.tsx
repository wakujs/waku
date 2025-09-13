import { unstable_defineServer as defineServer } from 'waku/minimal/server';
import { unstable_engine as engine } from 'waku/server';

import App from './components/App.js';

const entries: ReturnType<typeof defineServer> = defineServer({
  handleRequest: async (input, { renderRsc }) => {
    if (input.type === 'component') {
      return renderRsc({ App: <App name={input.rscPath || 'Waku'} /> });
    }
    if (input.type === 'function') {
      const value = await input.fn(...input.args);
      return renderRsc({ _value: value });
    }
  },
  handleBuild: async () => {},
  createFetch: engine.createFetch,
});

export default entries;
