import adapter from 'waku/adapters/default';
import App from './components/App.js';

const BUILD_MATADATA_KEY = 'metadata-key';
const BUILD_MATADATA_VALUE = 'metadata-value';

export default adapter({
  handleRequest: async (input, { renderRsc, loadBuildMetadata }) => {
    if (input.type === 'component') {
      return renderRsc({
        App: (
          <App
            name={input.rscPath || 'Waku'}
            params={input.rscParams}
            metadata={loadBuildMetadata(BUILD_MATADATA_KEY) || 'Empty'}
          />
        ),
      });
    }
    if (input.type === 'function') {
      const value = await input.fn(...input.args);
      return renderRsc({ _value: value });
    }
    return 'fallback';
  },
  handleBuild: async ({ saveBuildMetadata }) => {
    saveBuildMetadata(BUILD_MATADATA_KEY, BUILD_MATADATA_VALUE);
  },
});
