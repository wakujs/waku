import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';

import App from './components/App.js';

const entries: ReturnType<typeof defineEntries> = defineEntries({
  handleRequest: async (input, { renderRsc }) => {
    if (input.type === 'component') {
      return renderRsc({
        App: <App name={input.rscPath || 'Waku'} params={input.rscParams} />,
      });
    }
    if (input.type === 'function') {
      const value = await input.fn(...input.args);
      return renderRsc({ _value: value });
    }
    return 'fallback';
  },
  handleBuild: () => null,
});

export default entries;
