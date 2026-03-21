import { expect, test } from 'vitest';
import { patchRsdwPlugin } from '../src/lib/vite-plugins/patch-rsdw.js';

const DEVELOPMENT_ID =
  '/tmp/react-server-dom-webpack-client.browser.development.js';

const runTransform = async (code: string, id = DEVELOPMENT_ID) => {
  const plugin = patchRsdwPlugin();
  if (typeof plugin.transform !== 'function') {
    throw new Error('Plugin transform is not defined');
  }
  return plugin.transform.call({} as never, code, id);
};

test('patches the browser client bundle with the debugInfo fallback', async () => {
  const output = await runTransform(`\
function flushComponentPerformance(response, root) {
  let debugInfo = root._debugInfo;
  if (debugInfo) {
    return debugInfo.length;
  }
}
`);

  expect(output).toContain('resolveLazy(root.value)');
  expect(output).toContain('_resolved._debugInfo');
  expect(output).toContain('"fulfilled" === root.status');
});

test('skips unrelated files', async () => {
  const output = await runTransform(
    'let debugInfo = root._debugInfo;',
    '/tmp/unrelated.js',
  );
  expect(output).toBeUndefined();
});
