import adapter from 'waku/adapters/default';
import { Slot } from 'waku/minimal/client';
import App from './components/App';
import AppWithoutSsr from './components/AppWithoutSsr';
import InnerApp from './components/InnerApp';

export default adapter({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      const params = new URLSearchParams(
        input.rscPath || 'App=Waku&InnerApp=0',
      );
      const result: Record<string, unknown> = {};
      if (params.has('App')) {
        result.App = <App name={params.get('App')!} />;
      }
      if (params.has('InnerApp')) {
        result.InnerApp = <InnerApp count={Number(params.get('InnerApp'))} />;
      }
      if (params.has('AppWithoutSsr')) {
        result.AppWithoutSsr = <AppWithoutSsr />;
      }
      return renderRsc(result);
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml(
        { App: <App name="Waku" />, InnerApp: <InnerApp count={0} /> },
        <Slot id="App" />,
        { rscPath: '' },
      );
    }
  },
  handleBuild: async ({
    renderRsc,
    rscPath2pathname,
    generateFile,
    generateDefaultHtml,
  }) => {
    await generateFile(rscPath2pathname(''), () =>
      renderRsc({
        App: <App name="Waku" />,
        InnerApp: <InnerApp count={0} />,
      }),
    );
    for (const count of [1, 2, 3, 4, 5]) {
      await generateFile(rscPath2pathname(`InnerApp=${count}`), () =>
        renderRsc({ App: <App name="Waku" /> }),
      );
    }
    await generateDefaultHtml('/');
    await generateDefaultHtml('/no-ssr');
  },
});
