import adapter from 'waku/adapters/default';
import { unstable_runWithContext as runWithContext } from 'waku/internals';
import { Slot } from 'waku/minimal/client';
import App from './components/app';

export default adapter({
  handleRequest: (input, { renderRsc, renderHtml }) =>
    runWithContext(input.req, async () => {
      if (input.type === 'component') {
        return renderRsc({
          App: (
            <App name={input.rscPath || 'Waku'} rscParams={input.rscParams} />
          ),
        });
      }
      if (input.type === 'custom' && input.pathname === '/') {
        return renderHtml(
          await renderRsc({ App: <App name="Waku" rscParams={undefined} /> }),
          <Slot id="App" />,
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
      App: <App name="Waku" rscParams={undefined} />,
    });
    const [stream1, stream2] = stream.tee();
    await generateFile(rscPath2pathname(rscPath), stream1);
    const res = await renderHtml(stream2, <Slot id="App" />, { rscPath });
    await generateFile('index.html', res.body!);
  },
});
