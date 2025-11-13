import adapter from 'waku/adapters/default';
import { Slot } from 'waku/minimal/client';
import App from './components/app.js';

export default adapter({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      return renderRsc({ App: <App /> });
    }
    if (input.type === 'function') {
      const value = await input.fn(...input.args);
      return renderRsc({ _value: value });
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml(
        await renderRsc({ App: <App /> }),
        <Slot id="App" />,
        { rscPath: '' },
      );
    }
  },
  handleBuild: async () => {},
});
