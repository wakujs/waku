import { unstable_defineServer as defineServer } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';
import { unstable_engine as engine } from 'waku/server';

import App from './components/app';

export default defineServer({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      return renderRsc({
        App: <App name={input.rscPath || 'Waku'} rscParams={input.rscParams} />,
      });
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml(
        { App: <App name="Waku" rscParams={undefined} /> },
        <Slot id="App" />,
        { rscPath: '' },
      );
    }
  },
  handleBuild: async () => {},
  createFetch: engine.createFetch,
});
