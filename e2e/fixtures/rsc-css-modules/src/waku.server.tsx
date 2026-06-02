import adapter from 'waku/adapters/default';
import { unstable_runWithContext as runWithContext } from 'waku/internals';
import App from './components/App.js';

export default adapter({
  handleRequest: (input, { renderRsc }) =>
    runWithContext(input.req, async () => {
      if (input.type === 'component') {
        return renderRsc({ App: <App name={input.rscPath || 'Waku'} /> });
      }
      if (input.type === 'function') {
        const value = await input.fn(...input.args);
        return renderRsc({}, { value });
      }
      return 'fallback';
    }),
  handleBuild: async () => {},
});
