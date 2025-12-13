import adapter from 'waku/adapters/default';
import { Slot } from 'waku/minimal/client';
import App from './components/app';
import Layout from './components/layout';

export default adapter({
  handleRequest: async (input, { renderRsc, renderHtml, getRscInput }) => {
    const rscInput = await getRscInput(input.req);
    if (rscInput?.type === 'component') {
      return renderRsc({
        App: (
          <Layout>
            <App name={rscInput.rscPath || 'Waku'} />
          </Layout>
        ),
      });
    }
    if (input.pathname === '/') {
      return renderHtml(
        await renderRsc({
          App: (
            <Layout>
              <App name={'Waku'} />
            </Layout>
          ),
        }),
        <Slot id="App" />,
        { rscPath: '' },
      );
    }
  },
  handleBuild: async () => {},
});
