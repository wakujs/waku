import { Slot } from 'waku/minimal/client';
import { nodeAdapter } from 'waku/adapters/node';

import App from './components/App.js';
import TestApp from './components/test-app.js';

export default nodeAdapter({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      if (input.rscPath === 'test') {
        return renderRsc({ TestApp: <TestApp /> });
      }
      return renderRsc({ App: <App name={input.rscPath || 'Waku'} /> });
    }
    if (input.type === 'function') {
      const value = await input.fn(...input.args);
      return renderRsc({ _value: value });
    }
    if (input.type === 'custom') {
      if (input.pathname === '/') {
        return renderHtml({ App: <App name="Waku" /> }, <Slot id="App" />, {
          rscPath: '',
        });
      }
      if (input.pathname === '/test') {
        return renderHtml({ TestApp: <TestApp /> }, <Slot id="TestApp" />, {
          rscPath: 'test',
        });
      }
    }
  },
  handleBuild: async () => {},
});
