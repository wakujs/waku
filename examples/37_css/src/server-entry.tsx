import { Slot } from 'waku/minimal/client';
import { unstable_defineServer as defineServer } from 'waku/minimal/server';
import App from './components/app';
import Layout from './components/layout';

export default defineServer({
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
        {
          App: (
            <Layout>
              <App name={'Waku'} />
            </Layout>
          ),
        },
        <Slot id="App" />,
        { rscPath: '' },
      );
    }
  },
  handleBuild: async () => {},
});
