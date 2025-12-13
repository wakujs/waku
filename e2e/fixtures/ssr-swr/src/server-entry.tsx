import adapter from 'waku/adapters/default';
import { Slot } from 'waku/minimal/client';
import App from './components/App.js';

export default adapter({
  handleRequest: async (input, { renderRsc, renderHtml, getRscInput }) => {
    const rscInput = await getRscInput(input.req);
    if (rscInput?.type === 'component') {
      return renderRsc({ App: <App name={rscInput.rscPath || 'Waku'} /> });
    }
    if (rscInput?.type === 'function') {
      const value = await rscInput.fn(...rscInput.args);
      return renderRsc({ _value: value });
    }
    if (input.pathname === '/') {
      return renderHtml(
        await renderRsc({ App: <App name="Waku" /> }),
        <Slot id="App" />,
        {
          rscPath: '',
        },
      );
    }
  },
  handleBuild: async () => {},
});
