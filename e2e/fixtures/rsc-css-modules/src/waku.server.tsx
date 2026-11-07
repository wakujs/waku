import adapter from 'waku/adapters/default';
import App from './components/app.js';

export default adapter({
  handleRequest: async (input, { renderRsc, renderHtmlFallback }) => {
    if (input.type === 'rsc') {
      return renderRsc({ App: <App name={input.rscPath || 'Waku'} /> });
    }
    if (input.type === 'call') {
      const value = await input.fn(...input.args);
      return renderRsc({}, { value });
    }
    return renderHtmlFallback();
  },
  handleBuild: async () => {},
});
