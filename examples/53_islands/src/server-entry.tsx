import { unstable_defineServer as defineServer } from 'waku/minimal/server';
import { Children, Slot } from 'waku/minimal/client';
import { unstable_engine as engine } from 'waku/server';

import App from './components/App';
import Dynamic from './components/Dynamic';

export default defineServer({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      if (input.rscPath === '') {
        return renderRsc({
          App: <App name={input.rscPath || 'Waku'} />,
        });
      }
      if (input.rscPath === 'dynamic-slices') {
        return renderRsc({
          'slice:dynamic': (
            <Dynamic>
              <Children />
            </Dynamic>
          ),
        });
      }
      throw new Error('Unexpected rscPath: ' + input.rscPath);
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml({ App: <App name="Waku" /> }, <Slot id="App" />, {
        rscPath: '',
      });
    }
  },
  handleBuild: async ({
    renderRsc,
    renderHtml,
    rscPath2pathname,
    generateFile,
  }) => {
    await generateFile(
      rscPath2pathname(''),
      renderRsc({ App: <App name="Waku" /> }),
    );
    await generateFile(
      '/',
      renderHtml({ App: <App name="Waku" /> }, <Slot id="App" />, {
        rscPath: '',
      }).then((res) => res.body || ''),
    );
  },
  createFetch: engine.createFetch,
});
