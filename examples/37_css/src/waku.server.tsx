import adapter from 'waku/adapters/default';
import { Slot } from 'waku/minimal/client';
import App from './components/app';
import Layout from './components/layout';

export default adapter({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      return renderRsc({
        App: (
          <Layout>
            <App name={input.rscPath || 'Waku'} />
          </Layout>
        ),
      });
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml(
        await renderRsc({
          App: (
            <Layout>
              <App name="Waku" />
            </Layout>
          ),
        }),
        <Slot id="App" />,
        { rscPath: '' },
      );
    }
  },
  handleBuild: async ({
    rscPath2pathname,
    renderRsc,
    renderHtml,
    generateFile,
  }) => {
    const rscPath = '';
    const stream = await renderRsc({
      App: (
        <Layout>
          <App name="Waku" />
        </Layout>
      ),
    });
    const [stream1, stream2] = stream.tee();
    await generateFile(rscPath2pathname(rscPath), stream1);
    const res = await renderHtml(stream2, <Slot id="App" />, { rscPath });
    await generateFile('index.html', res.body!);
  },
});
