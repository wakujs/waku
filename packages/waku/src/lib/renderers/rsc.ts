import type { ReactNode } from 'react';
import type { default as RSDWServerType } from 'react-server-dom-webpack/server.edge';

import type { PureConfig } from '../config.js';
// TODO move types somewhere
import type { HandlerContext } from '../middleware/types.js';

type Elements = Record<string, ReactNode>;

const resolveClientEntryForPrd = (id: string, config: { basePath: string }) => {
  return config.basePath + id + '.js';
};

export function renderRsc(
  config: PureConfig,
  ctx: HandlerContext,
  elements: Elements,
): ReadableStream {
  if (Object.keys(elements).some((key) => key.startsWith('_'))) {
    throw new Error('"_" prefix is reserved');
  }
  const modules = ctx.unstable_modules;
  if (!modules) {
    throw new Error('handler middleware required (missing modules)');
  }
  const {
    default: {
      renderToReadableStream,
      // decodeReply,
    },
  } = modules.rsdwServer as { default: typeof RSDWServerType };
  const resolveClientEntry = ctx.unstable_devServer
    ? ctx.unstable_devServer.resolveClientEntry
    : resolveClientEntryForPrd;
  const clientBundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [file, name] = encodedId.split('#') as [string, string];
        const id = resolveClientEntry(file, config);
        return { id, chunks: [id], name, async: true };
      },
    },
  );
  return renderToReadableStream(elements, clientBundlerConfig);
}
