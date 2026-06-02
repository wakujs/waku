import adapter from 'waku/adapters/default';
import { unstable_runWithContext as runWithContext } from 'waku/internals';
import App from './components/App.js';

const BUILD_MATADATA_KEY = 'metadata-key';
const BUILD_MATADATA_VALUE = 'metadata-value';

export default adapter({
  handleRequest: (input, { renderRsc, loadBuildMetadata }) =>
    runWithContext(input.req, async () => {
      if (input.type === 'component') {
        return renderRsc({
          App: (
            <App
              name={input.rscPath || 'Waku'}
              params={input.rscParams}
              metadata={
                (await loadBuildMetadata(BUILD_MATADATA_KEY)) || 'Empty'
              }
            />
          ),
        });
      }
      if (input.type === 'function') {
        const value = await input.fn(...input.args);
        return renderRsc({}, { value });
      }
      return 'fallback';
    }),
  handleBuild: async ({ saveBuildMetadata }) => {
    await saveBuildMetadata(BUILD_MATADATA_KEY, BUILD_MATADATA_VALUE);
  },
});
