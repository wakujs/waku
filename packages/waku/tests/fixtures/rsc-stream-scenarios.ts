// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../src/lib/react-types.d.ts" />

import { Suspense, createElement } from 'react';
import { createFromReadableStream } from 'react-server-dom-webpack/client.edge';
import { renderToReadableStream } from 'react-server-dom-webpack/server.edge';

const scenarioName = process.env.WAKU_RSC_STREAM_SCENARIO;
const helperOutputUrl = process.env.WAKU_RSC_STREAM_HELPER_URL;

if (!scenarioName) {
  throw new Error('Missing scenario name.');
}
if (!helperOutputUrl) {
  throw new Error('Missing helper module URL.');
}

const { waitForRootPrerequisites } = await import(helperOutputUrl);

const serverConsumerManifest = {
  moduleMap: null,
  moduleLoading: null,
  serverModuleMap: null,
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const isObjectLike = (value: unknown): value is object => {
  return (
    (typeof value === 'object' || typeof value === 'function') && value !== null
  );
};

const getObjectProperty = (value: unknown, key: string): object | null => {
  if (!isObjectLike(value)) {
    return null;
  }
  const property = Reflect.get(value, key);
  return isObjectLike(property) ? property : null;
};

const getMapProperty = (
  value: unknown,
  key: string,
): Map<unknown, unknown> | null => {
  if (!isObjectLike(value)) {
    return null;
  }
  const property = Reflect.get(value, key);
  return property instanceof Map ? property : null;
};

const getStringProperty = (value: unknown, key: string): string | null => {
  if (!isObjectLike(value)) {
    return null;
  }
  const property = Reflect.get(value, key);
  return typeof property === 'string' ? property : null;
};

const getObjectValues = (value: object): object[] => {
  if (Array.isArray(value)) {
    return value.filter(isObjectLike);
  }
  if (value instanceof Map) {
    return [...value.keys(), ...value.values()].filter(isObjectLike);
  }
  if (value instanceof Set) {
    return [...value].filter(isObjectLike);
  }
  return Object.values(value).filter(isObjectLike);
};

function createScenarioRoot() {
  let resolveValue: (value: string) => void = (_value: string) => {
    throw new Error('Pending value resolver is not ready.');
  };
  const pendingValue = new Promise((resolve: (value: string) => void) => {
    resolveValue = resolve;
  });

  async function Delayed() {
    const value = await pendingValue;
    return createElement('div', null, value);
  }

  const model = createElement(
    Suspense,
    { fallback: createElement('div', null, 'loading') },
    createElement(Delayed),
  );

  return {
    resolveValue,
    root: createFromReadableStream(renderToReadableStream(model, {}), {
      serverConsumerManifest,
    }),
  };
}

async function waitUntil(
  getValue: () => boolean,
  errorMessage: string,
  attempts = 40,
) {
  for (let i = 0; i < attempts; i++) {
    if (getValue()) {
      return;
    }
    await sleep(5);
  }
  throw new Error(errorMessage);
}

function getPayloadStatus(root: unknown) {
  const props = getObjectProperty(root, 'props');
  const children = getObjectProperty(props, 'children');
  const payload = getObjectProperty(children, '_payload');
  return getStringProperty(payload, 'status');
}

function countPendingReasonChunks(reasonChunks: Map<unknown, unknown>) {
  let count = 0;
  for (const value of reasonChunks.values()) {
    const status = getStringProperty(value, 'status');
    if (status === 'pending' || status === 'blocked') {
      count++;
    }
  }
  return count;
}

function searchBridgeChunk(root: unknown) {
  const seen = new Set<object>();
  const stack = isObjectLike(root) ? [root] : [];

  while (stack.length) {
    const value = stack.pop();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);

    const reason = getObjectProperty(value, 'reason');
    const reasonChunks = getMapProperty(reason, '_chunks');
    if (getStringProperty(value, 'status') && reasonChunks) {
      const pendingCount = countPendingReasonChunks(reasonChunks);
      if (pendingCount > 0) {
        return { chunk: value, pendingCount };
      }
    }

    for (const nested of getObjectValues(value)) {
      stack.push(nested);
    }
  }

  return null;
}

async function waitForBridgeChunk(root: unknown) {
  let chunk: object | null = null;
  let pendingCount = 0;
  await waitUntil(() => {
    const bridgeChunk = searchBridgeChunk(root);
    if (bridgeChunk) {
      chunk = bridgeChunk.chunk;
      pendingCount = bridgeChunk.pendingCount;
      return true;
    }
    return false;
  }, 'Bridge chunk with pending work did not appear before the delayed chunk resolved.');
  if (!chunk) {
    throw new Error('Bridge chunk was not found.');
  }
  return { chunk, pendingCount };
}

async function runSettledRootScenario() {
  const { root, resolveValue } = createScenarioRoot();

  let rootSettled = false;
  void Promise.resolve(root)
    .then(() => {
      rootSettled = true;
    })
    .catch(() => {});

  await waitUntil(
    () => rootSettled,
    'Root did not settle before the delayed chunk resolved.',
  );

  const earlyRoot = await root;
  const payloadStatusBeforeResolve = getPayloadStatus(earlyRoot);

  let rootWaitSettled = false;
  const rootWaitPromise = waitForRootPrerequisites(root).then(() => {
    rootWaitSettled = true;
  });
  const result = {
    payloadStatusBeforeResolve,
    rootSettledBeforeResolve: rootSettled,
    rootWaitSettledBeforeResolve: rootWaitSettled,
  };

  resolveValue('done');
  await rootWaitPromise;

  return {
    payloadStatusAfterResolve: getPayloadStatus(earlyRoot),
    ...result,
  };
}

async function runBridgeChunkScenario() {
  const { root, resolveValue } = createScenarioRoot();
  const { chunk, pendingCount } = await waitForBridgeChunk(root);

  let bridgeWaitSettled = false;
  const bridgeWaitPromise = waitForRootPrerequisites(chunk).then(() => {
    bridgeWaitSettled = true;
  });
  const result = {
    bridgeChunkFound: true,
    bridgePendingCountBeforeResolve: pendingCount,
    bridgeWaitSettledBeforeResolve: bridgeWaitSettled,
  };

  resolveValue('done');
  await bridgeWaitPromise;
  return result;
}

switch (scenarioName) {
  case 'bridge-chunk':
    console.log(JSON.stringify(await runBridgeChunkScenario()));
    break;
  case 'settled-root':
    console.log(JSON.stringify(await runSettledRootScenario()));
    break;
  default:
    throw new Error(`Unknown scenario: ${scenarioName}`);
}
