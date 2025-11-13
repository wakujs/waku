import adapter from 'waku/adapters/default';
import { Children, Slot } from 'waku/minimal/client';
import App from './components/App';

export default adapter({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
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
  },
  handleBuild: async () => {},
});
