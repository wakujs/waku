import adapter from 'waku/adapters/default';
import { unstable_runWithContext as runWithContext } from 'waku/internals';

export default adapter({
  handleRequest: (input, { renderRsc }) =>
    runWithContext(input.req, async () => {
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
