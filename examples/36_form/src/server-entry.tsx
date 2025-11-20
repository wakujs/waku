import adapter from 'waku/adapters/default';
import { Slot } from 'waku/minimal/client';
import { runWithRerender } from './als';
import App from './components/App';

export default adapter({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      return renderRsc({ App: <App name={input.rscPath || 'Waku'} /> });
    }
    if (input.type === 'function') {
      const elements: Record<string, unknown> = {};
      const rerender = (rscPath: string) => {
        elements.App = <App name={rscPath || 'Waku'} />;
      };
      const value = await runWithRerender(rerender, () =>
        input.fn(...input.args),
      );
      return renderRsc({ ...elements, _value: value });
    }
    if (
      (input.type === 'action' || input.type === 'custom') &&
      input.pathname === '/'
    ) {
      const actionResult =
        input.type === 'action' ? await input.fn() : undefined;
      return renderHtml(
        await renderRsc({ App: <App name="Waku" /> }),
        <Slot id="App" />,
        {
          rscPath: '',
          actionResult,
        },
      );
    }
  },
  handleBuild: async () => {},
});
