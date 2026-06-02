import adapter from 'waku/adapters/default';
import { unstable_runWithRequest as runWithRequest } from 'waku/internals';
import { Children, Slot } from 'waku/minimal/client';
import App from './components/App';

export default adapter({
  handleRequest: (input, { renderRsc, renderHtml }) =>
    runWithRequest(input.req, async () => {
      if (input.type === 'component') {
        return renderRsc({
          App: (
            <App name={input.rscPath || 'Waku'}>
              <Children />
            </App>
          ),
        });
      }
      if (input.type === 'custom' && input.pathname === '/') {
        return renderHtml(
          await renderRsc({
            App: (
              <App name="Waku">
                <Children />
              </App>
            ),
          }),
          <Slot id="App">
            <h3>A client element</h3>
          </Slot>,
          { rscPath: '' },
        );
      }
    }),
  handleBuild: async ({
    rscPath2pathname,
    renderRsc,
    renderHtml,
    generateFile,
  }) => {
    const rscPath = '';
    const stream = await renderRsc({
      App: (
        <App name="Waku">
          <Children />
        </App>
      ),
    });
    const [stream1, stream2] = stream.tee();
    await generateFile(rscPath2pathname(rscPath), stream1);
    const res = await renderHtml(
      stream2,
      <Slot id="App">
        <h3>A client element</h3>
      </Slot>,
      { rscPath },
    );
    await generateFile('index.html', res.body!);
  },
});
