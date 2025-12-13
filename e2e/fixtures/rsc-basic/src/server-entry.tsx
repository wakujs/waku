import adapter from 'waku/adapters/default';
import App from './components/App.js';

const BUILD_MATADATA_KEY = 'metadata-key';
const BUILD_MATADATA_VALUE = 'metadata-value';

export default adapter({
  handleRequest: async (
    input,
    { renderRsc, getRscInput, loadBuildMetadata },
  ) => {
    const rscInput = await getRscInput(input.req);
    if (rscInput?.type === 'component') {
      return renderRsc({
        App: (
          <App
            name={rscInput.rscPath || 'Waku'}
            params={rscInput.rscParams}
            metadata={(await loadBuildMetadata(BUILD_MATADATA_KEY)) || 'Empty'}
          />
        ),
      });
    }
    if (rscInput?.type === 'function') {
      const value = await rscInput.fn(...rscInput.args);
      return renderRsc({ _value: value });
    }
    return 'fallback';
  },
  handleBuild: async ({ saveBuildMetadata }) => {
    await saveBuildMetadata(BUILD_MATADATA_KEY, BUILD_MATADATA_VALUE);
  },
});
