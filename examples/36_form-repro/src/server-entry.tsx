import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';

import App from './components/App';

export default defineEntries({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      return renderRsc({ App: <App /> });
    }
    if (input.type === 'custom') {
      return renderHtml({ App: <App /> }, <Slot id="App" />, {
        rscPath: '',
      });
    }
  },
  handleBuild: () => null,
});
