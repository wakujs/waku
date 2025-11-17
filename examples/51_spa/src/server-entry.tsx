import adapter from 'waku/adapters/default';

export default adapter({
  handleRequest: async (input, { renderRsc }) => {
    if (input.type === 'function') {
      const value = await input.fn(...input.args);
      return renderRsc({ _value: value });
    }
    return 'fallback';
  },
  handleBuild: async () => {},
});
