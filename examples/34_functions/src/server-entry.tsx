import { nodeAdapter } from 'waku/adapters/node';
import { Slot } from 'waku/minimal/client';
import { runWithRerender } from './als';
import App from './components2/App';

export default nodeAdapter({
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
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml({ App: <App name="Waku" /> }, <Slot id="App" />, {
        rscPath: '',
      });
    }
  },
  handleBuild: async () => {},
});
