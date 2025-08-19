import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';
import { unstable_createAsyncIterable as createAsyncIterable } from 'waku/server';

import App from './components/App';
import InnerApp from './components/InnerApp';
import AppWithoutSsr from './components/AppWithoutSsr';

export default defineEntries({
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
  handleBuild: ({ renderRsc, rscPath2pathname }) =>
    createAsyncIterable(async () => {
      const tasks = [
        async () => ({
          type: 'file' as const,
          pathname: rscPath2pathname(''),
          body: renderRsc({
            App: <App name="Waku" />,
            InnerApp: <InnerApp count={0} />,
          }),
        }),
        ...[1, 2, 3, 4, 5].map((count) => async () => ({
          type: 'file' as const,
          pathname: rscPath2pathname(`InnerApp=${count}`),
          body: renderRsc({ App: <App name="Waku" /> }),
        })),
        async () => ({
          type: 'defaultHtml' as const,
          pathname: '/',
          htmlHead: '',
        }),
        async () => ({
          type: 'defaultHtml' as const,
          pathname: '/no-ssr',
          htmlHead: '',
        }),
      ];
      return tasks;
    }),
});
