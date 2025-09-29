import { Slot } from 'waku/minimal/client';
import { nodeAdapter } from 'waku/adapters/node';

import Layout from './components/layout';
import App from './components/app';

export default nodeAdapter({
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
