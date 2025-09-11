import { unstable_defineServer as defineServer } from 'waku/minimal/server';

export default defineServer({
  handleRequest: async (input, { renderRsc }) => {
    if (input.type === 'function') {
      const value = await input.fn(...input.args);
      return renderRsc({ _value: value });
    }
    return 'fallback';
  },
  handleBuild: () => null,
});
