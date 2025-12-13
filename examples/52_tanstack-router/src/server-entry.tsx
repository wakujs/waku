import adapter from 'waku/adapters/default';

export default adapter({
  handleRequest: async (input, { renderRsc, getRscInput }) => {
    const rscInput = await getRscInput(input.req);
    if (rscInput?.type === 'function') {
      const value = await rscInput.fn(...rscInput.args);
      return renderRsc({ _value: value });
    }
    return 'fallback';
  },
  handleBuild: async () => {},
});
