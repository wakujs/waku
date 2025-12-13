import adapter from 'waku/adapters/default';
import { Slot } from 'waku/minimal/client';
import App from './components/app';

export default adapter({
  handleRequest: async (input, { renderRsc, renderHtml, getRscInput }) => {
    const rscInput = await getRscInput(input.req);
    if (rscInput?.type === 'component') {
      return renderRsc({
        App: (
          <App
            name={rscInput.rscPath || 'Waku'}
            rscParams={rscInput.rscParams}
          />
        ),
      });
    }
    if (input.pathname === '/') {
      return renderHtml(
        await renderRsc({ App: <App name="Waku" rscParams={undefined} /> }),
        <Slot id="App" />,
        { rscPath: '' },
      );
    }
  },
  handleBuild: async () => {},
});
