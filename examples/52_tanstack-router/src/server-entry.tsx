import { unstable_defineServer as defineServer } from 'waku/minimal/server';
import { unstable_engine as engine } from 'waku/server';

export default defineServer({
  handleRequest: async (input, { renderRsc }) => {
    if (input.type === 'function') {
      const value = await input.fn(...input.args);
      return renderRsc({ _value: value });
    }
    return 'fallback';
  },
  handleBuild: async () => {},
  createFetch: engine.createFetch,
});
