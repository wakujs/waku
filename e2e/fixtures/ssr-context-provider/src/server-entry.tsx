import { nodeAdapter } from 'waku/adapters/node';
import { Slot } from 'waku/minimal/client';
import App from './components/app.js';

export default nodeAdapter({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      return renderRsc({ App: <App /> });
    }
    if (input.type === 'function') {
      const value = await input.fn(...input.args);
      return renderRsc({ _value: value });
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml({ App: <App /> }, <Slot id="App" />, { rscPath: '' });
    }
  },
  handleBuild: async () => {},
});
