import { expect, test } from 'vitest';
import { DEFAULT_METADATA_FILTER } from '../src/lib/utils/html-metadata.js';
import { htmlTransformPlugin } from '../src/lib/vite-plugins/html-transform.js';

const MODULE_ID = 'virtual:vite-rsc-waku/html-transform';

const runResolve = async (source: string) => {
  const plugin = htmlTransformPlugin();
  if (typeof plugin.resolveId !== 'function') {
    throw new Error('Plugin resolveId is not defined');
  }
  return plugin.resolveId.call({} as never, source, undefined, {} as never);
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

const loadedFilter = (code: string) => {
  const match = /^const filter = (.*);$/m.exec(code);
  if (!match) {
    throw new Error(`No filter in: ${code}`);
  }
  return JSON.parse(match[1]!);
};

test('claims only its own module id', async () => {
  await expect(runResolve(MODULE_ID)).resolves.toBe('\0' + MODULE_ID);
  await expect(runResolve('virtual:vite-rsc-waku/html-shell')).resolves.toBe(
    undefined,
  );
  await expect(
    runLoad(undefined, '\0virtual:vite-rsc-waku/html-shell'),
  ).resolves.toBe(undefined);
});

test('provides the default filter when given no options', async () => {
  const code = (await runLoad()) as string;
  expect(code).toContain('dedupeHtmlMetadataStream');
  expect(loadedFilter(code)).toEqual(DEFAULT_METADATA_FILTER);
});

test('provides no transform when the merge is off', async () => {
  await expect(runLoad({ mergeMetadata: false })).resolves.toBe(
    'export default undefined;',
  );
});

test('keeps the defaults when a filter field is left undefined', async () => {
  // A plain-JS waku.config.js is not held to exactOptionalPropertyTypes.
  const code = (await runLoad({
    mergeMetadata: { metaNames: undefined },
  } as never)) as string;
  expect(loadedFilter(code)).toEqual(DEFAULT_METADATA_FILTER);
});

test('fills a partial filter in from the defaults', async () => {
  const code = (await runLoad({
    mergeMetadata: { metaNames: ['robots'] },
  })) as string;
  expect(loadedFilter(code)).toEqual({
    metaNames: ['robots'],
    metaProperties: DEFAULT_METADATA_FILTER.metaProperties,
  });
});
