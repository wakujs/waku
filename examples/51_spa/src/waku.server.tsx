import adapter from 'waku/adapters/default';
import { unstable_runWithRequest as runWithRequest } from 'waku/internals';

export default adapter({
  handleRequest: (input, { renderRsc }) =>
    runWithRequest(input.req, async () => {
      if (input.type === 'function') {
        const value = await input.fn(...input.args);
        return renderRsc({}, { value });
      }
      return 'fallback';
    }),
  handleBuild: async ({ generateDefaultHtml }) => {
    await generateDefaultHtml('index.html');
  },
});
