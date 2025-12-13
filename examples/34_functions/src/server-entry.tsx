import adapter from 'waku/adapters/default';
import { Slot } from 'waku/minimal/client';
import { runWithRerender } from './als';
import App from './components2/App';

export default adapter({
  handleRequest: async (input, { renderRsc, renderHtml, getRscInput }) => {
    const rscInput = await getRscInput(input.req);
    if (rscInput?.type === 'component') {
      return renderRsc({ App: <App name={rscInput.rscPath || 'Waku'} /> });
    }
    if (rscInput?.type === 'function') {
      const elements: Record<string, unknown> = {};
      const rerender = (rscPath: string) => {
        elements.App = <App name={rscPath || 'Waku'} />;
      };
      const value = await runWithRerender(rerender, () =>
        rscInput.fn(...rscInput.args),
      );
      return renderRsc({ ...elements, _value: value });
    }
    if (input.pathname === '/') {
      return renderHtml(
        await renderRsc({ App: <App name="Waku" /> }),
        <Slot id="App" />,
        {
          rscPath: '',
        },
      );
    }
  },
  handleBuild: async () => {},
});
