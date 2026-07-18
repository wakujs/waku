import adapter from 'waku/adapters/default';
import { Slot } from 'waku/minimal/client';
import App from './components/App.js';
import { MixedForms, receivePlainPost } from './components/MixedForms.js';
import TestApp from './components/test-app.js';

export default adapter({
  handleRequest: async (
    input,
    { renderRsc, renderHtml, decodeAction, decodeFormState },
  ) => {
    if (input.type === 'component') {
      if (input.rscPath === 'test') {
        return renderRsc({ TestApp: <TestApp /> });
      }
      if (input.rscPath === 'mixed-forms') {
        return renderRsc({ MixedForms: <MixedForms /> });
      }
      return renderRsc({ App: <App name={input.rscPath || 'Waku'} /> });
    }
    if (input.type === 'function') {
      const value = await input.fn(...input.args);
      return renderRsc({}, { value });
    }
    if (input.type === 'custom') {
      if (input.pathname === '/mixed-forms') {
        let formState: unknown;
        if (input.req.method === 'POST') {
          const formData = await input.req.formData();
          const action = await decodeAction(formData);
          if (action) {
            formState = await decodeFormState(await action(), formData);
          } else {
            receivePlainPost(formData);
          }
        }
        return renderHtml(
          await renderRsc({ MixedForms: <MixedForms /> }),
          <Slot id="MixedForms" />,
          { rscPath: 'mixed-forms', formState: formState as never },
        );
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
      if (input.pathname === '/test') {
        return renderHtml(
          await renderRsc({ TestApp: <TestApp /> }),
          <Slot id="TestApp" />,
          {
            rscPath: 'test',
          },
        );
      }
    }
  },
  handleBuild: async () => {},
});
