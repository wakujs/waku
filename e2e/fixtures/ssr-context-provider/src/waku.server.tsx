import adapter from 'waku/adapters/default';
import { unstable_runWithRequest as runWithRequest } from 'waku/internals';
import { Slot } from 'waku/minimal/client';
import App from './components/app.js';

export default adapter({
  handleRequest: (input, { renderRsc, renderHtml }) =>
    runWithRequest(input.req, async () => {
      if (input.type === 'component') {
        return renderRsc({ App: <App /> });
      }
      if (input.type === 'function') {
        const value = await input.fn(...input.args);
        return renderRsc({}, { value });
      }
      if (input.type === 'custom' && input.pathname === '/') {
        return renderHtml(
          await renderRsc({ App: <App /> }),
          <Slot id="App" />,
          {
            rscPath: '',
          },
        );
      }
    }),
  handleBuild: async () => {},
});
