import adapter from 'waku/adapters/default';
import { unstable_runWithContext as runWithContext } from 'waku/internals';
import { Slot } from 'waku/minimal/client';
import App from './components/App.js';

// Fixed nonce for testing purposes
const TEST_NONCE = 'test-nonce-12345';

export default adapter({
  handleRequest: (input, { renderRsc, renderHtml }) =>
    runWithContext(input.req, async () => {
      if (input.type === 'component') {
        return renderRsc({ App: <App /> });
      }
      if (input.type === 'custom' && input.pathname === '/') {
        const response = await renderHtml(
          await renderRsc({ App: <App /> }),
          <Slot id="App" />,
          {
            rscPath: '',
            nonce: TEST_NONCE,
          },
        );

        // Set CSP header with the nonce
        response.headers.set(
          'Content-Security-Policy',
          `script-src 'self' 'nonce-${TEST_NONCE}';`,
        );

        return response;
      }
    }),
  handleBuild: async () => {},
});
