import adapter from 'waku/adapters/default';
import { Slot } from 'waku/minimal/client';
import App from './components/app.js';

export default adapter({
  handleRequest: async (input, { renderRsc, renderHtml, getRscInput }) => {
    const rscInput = await getRscInput(input.req);
    if (rscInput?.type === 'component') {
      return renderRsc({ App: <App /> });
    }
    if (rscInput?.type === 'function') {
      const value = await rscInput.fn(...rscInput.args);
      return renderRsc({ _value: value });
    }
    if (input.pathname === '/') {
      return renderHtml(await renderRsc({ App: <App /> }), <Slot id="App" />, {
        rscPath: '',
      });
    }
  },
  handleBuild: async () => {},
});
