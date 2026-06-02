import adapter from 'waku/adapters/default';
import { unstable_runWithContext as runWithContext } from 'waku/internals';
import { Slot } from 'waku/minimal/client';
import App from './components/App';

const stringToStream = (str: string): ReadableStream => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(str));
      controller.close();
    },
  });
};

export default adapter({
  handleRequest: (input, { renderRsc, renderHtml }) =>
    runWithContext(input.req, async () => {
      if (input.type === 'component') {
        return renderRsc({ App: <App name={input.rscPath || 'Waku'} /> });
      }
      if (input.type === 'custom' && input.pathname === '/') {
        return renderHtml(
          await renderRsc({ App: <App name="Waku" /> }),
          <Slot id="App" />,
          {
            rscPath: '',
          },
        );
      }
      if (input.type === 'custom' && input.pathname === '/api/hello') {
        return stringToStream('world');
      }
    }),
  handleBuild: async () => {},
});
