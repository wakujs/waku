import adapter from 'waku/adapters/default';
import { Children, Slot } from 'waku/minimal/client';
import App from './components/App';
import Dynamic from './components/Dynamic';

export default adapter({
  handleRequest: async (input, { renderRsc, renderHtml, getRscInput }) => {
    const rscInput = await getRscInput(input.req);
    if (rscInput?.type === 'component') {
      if (rscInput.rscPath === '') {
        return renderRsc({
          App: <App name={rscInput.rscPath || 'Waku'} />,
        });
      }
      if (rscInput.rscPath === 'dynamic-slices') {
        return renderRsc({
          'slice:dynamic': (
            <Dynamic>
              <Children />
            </Dynamic>
          ),
        });
      }
      throw new Error('Unexpected rscPath: ' + rscInput.rscPath);
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
  handleBuild: async ({
    renderRsc,
    renderHtml,
    rscPath2pathname,
    withRequest,
    generateFile,
  }) => {
    await withRequest(
      new Request(new URL('http://localhost:3000/')),
      async () => {
        const body = await renderRsc({ App: <App name="Waku" /> });
        await generateFile(rscPath2pathname(''), body);
      },
    );
    await withRequest(
      new Request(new URL('http://localhost:3000/')),
      async () => {
        const res = await renderHtml(
          await renderRsc({ App: <App name="Waku" /> }),
          <Slot id="App" />,
          {
            rscPath: '',
          },
        );
        await generateFile('/', res.body || '');
      },
    );
  },
});
