import adapter from 'waku/adapters/default';
import App from './components/App.js';

const BUILD_DATA_KEY = 'foo';
const BUILD_DATA_VALUE = 'build-data-value';

export default adapter({
  handleRequest: async (input, { renderRsc, loadBuildData }) => {
    if (input.type === 'component') {
      return renderRsc({
        App: (
          <App
            name={input.rscPath || 'Waku'}
            params={input.rscParams}
            buildData={loadBuildData(BUILD_DATA_KEY) || 'Empty'}
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
  handleBuild: async ({ saveBuildData }) => {
    saveBuildData(BUILD_DATA_KEY, BUILD_DATA_VALUE);
  },
});
