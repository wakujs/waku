import { expect, test } from 'vitest';
import { htmlTransformPlugin } from '../src/lib/vite-plugins/html-transform.js';

const MODULE_ID = 'virtual:vite-rsc-waku/html-transform';

const runResolve = async (source: string, environment = 'ssr') => {
  const plugin = htmlTransformPlugin();
  if (typeof plugin.resolveId !== 'function') {
    throw new Error('Plugin resolveId is not defined');
  }
  return plugin.resolveId.call(
    { environment: { name: environment } } as never,
    source,
    undefined,
    {} as never,
  );
};

const runLoad = async (
  options?: Parameters<typeof htmlTransformPlugin>[0],
  id = '\0' + MODULE_ID,
) => {
  const plugin = htmlTransformPlugin(options);
  if (typeof plugin.load !== 'function') {
    throw new Error('Plugin load is not defined');
  }
  return plugin.load.call({} as never, id);
};

const loadedArgs = (code: string) => {
  const match = /dedupeHtmlMetadataStream\((.*)\)/.exec(code);
  if (!match) {
    throw new Error(`No call in: ${code}`);
  }
  return match[1]!;
};

test('claims its own module id, and only where it runs', async () => {
  await expect(runResolve(MODULE_ID)).resolves.toBe('\0' + MODULE_ID);
  await expect(runResolve(MODULE_ID, 'client')).rejects.toThrow();
  await expect(runResolve('virtual:vite-rsc-waku/html-shell')).resolves.toBe(
    undefined,
  );
  await expect(
    runLoad(undefined, '\0virtual:vite-rsc-waku/html-shell'),
  ).resolves.toBe(undefined);
});

test('asks for the defaults when given no options', async () => {
  const code = (await runLoad()) as string;
  expect(code).toContain('dedupeHtmlMetadataStream');
  expect(loadedArgs(code)).toBe('{}');
});

test('passes the buffer cap through only when it is given', async () => {
  expect(loadedArgs((await runLoad()) as string)).toBe('{}');
  expect(loadedArgs((await runLoad({ maxBufferedHead: 4096 })) as string)).toBe(
    '{}, 4096',
  );
});

test('provides no transform when the merge is off', async () => {
  await expect(runLoad({ mergeMetadata: false })).resolves.toBe(
    'export default undefined;',
  );
});

test('passes a partial filter through as given', async () => {
  const code = (await runLoad({
    mergeMetadata: { metaNames: ['robots'] },
  })) as string;
  expect(loadedArgs(code)).toBe('{"metaNames":["robots"]}');
});
