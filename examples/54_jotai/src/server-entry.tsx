import { Slot } from 'waku/minimal/client';
import { nodeAdapter } from 'waku/adapters/node';

import App from './components/app';

export default nodeAdapter({
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
});
