import adapter from 'waku/adapters/default';
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
  handleRequest: async (input, { renderRsc, renderHtml, getRscInput }) => {
    const rscInput = await getRscInput(input.req);
    if (rscInput?.type === 'component') {
      return renderRsc({ App: <App name={rscInput.rscPath || 'Waku'} /> });
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
    if (input.pathname === '/api/hello') {
      return stringToStream('world');
    }
  },
  handleBuild: async () => {},
});
