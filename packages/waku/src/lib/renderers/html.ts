import { createElement } from 'react';
import type {
  ReactElement,
  ReactNode,
  FunctionComponent,
  ComponentProps,
} from 'react';
import type * as RDServerType from 'react-dom/server.edge';
import type { default as RSDWClientType } from 'react-server-dom-webpack/client.edge';
import { injectRSCPayload } from 'rsc-html-stream/server';

import type * as WakuMinimalClientType from '../../minimal/client.js';
import type { ConfigDev, ConfigPrd } from '../config.js';
import { SRC_MAIN } from '../builder/constants.js';
import { filePathToFileURL } from '../utils/path.js';
import { parseHtml } from '../utils/html-parser.js';
import { renderRsc, renderRscElement, getExtractFormState } from './rsc.js';
import type { HandlerContext, ErrorCallback } from '../middleware/types.js';

type Elements = Record<string, unknown>;

export const fakeFetchCode = `
Promise.resolve(new Response(new ReadableStream({
  start(c) {
    const d = (self.__FLIGHT_DATA ||= []);
    const t = new TextEncoder();
    const f = (s) => c.enqueue(typeof s === 'string' ? t.encode(s) : s);
    d.forEach(f);
    d.push = f;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => c.close());
    } else {
      c.close();
    }
  }
})))
`
  .split('\n')
  .map((line) => line.trim())
  .join('');

// TODO(daishi) I think we should be able to remove `parseHtml` completely,
// by changing the string based `htmlHead`. Will be BREAKING CHANGE.
const parseHtmlHead = (
  rscPathForFakeFetch: string,
  htmlHead: string,
  mainJsPath: string, // for DEV only, pass `''` for PRD
) => {
  htmlHead = htmlHead.replace(
    // HACK This is brittle
    /\nglobalThis\.__WAKU_PREFETCHED__ = {\n.*?\n};/s,
    '',
  );
  let headCode = `
globalThis.__WAKU_HYDRATE__ = true;
`;
  headCode += `globalThis.__WAKU_PREFETCHED__ = {
  '${rscPathForFakeFetch}': ${fakeFetchCode},
};
`;
  const arr = parseHtml(htmlHead) as ReactElement<any>[];
  const headModules: string[] = [];
  const headElements: ReactElement[] = [];
  for (const item of arr) {
    if (item.type === 'script') {
      if (item.props?.src) {
        headModules.push(item.props.src);
        continue;
      } else if (typeof item.props?.children === 'string') {
        headCode += item.props.children;
        continue;
      } else if (
        typeof item.props?.dangerouslySetInnerHTML?.__html === 'string' &&
        !item.props?.dangerouslySetInnerHTML?.__html.includes(
          '__WAKU_CLIENT_IMPORT__',
        )
      ) {
        headCode += item.props.dangerouslySetInnerHTML.__html;
        continue;
      }
    }
    headElements.push(item);
  }
  if (mainJsPath) {
    headModules.push(mainJsPath);
  }
  return { headCode, headModules, headElements };
};

// FIXME Why does it error on the first and second time?
let hackToIgnoreFirstTwoErrors = 2;

export async function renderHtml(
  config: ConfigDev | ConfigPrd,
  ctx: Pick<HandlerContext, 'unstable_modules' | 'unstable_devServer'>,
  htmlHead: string,
  elements: Elements,
  onError: Set<ErrorCallback>,
  html: ReactNode,
  rscPath: string,
  actionResult?: unknown,
): Promise<ReadableStream & { allReady: Promise<void> }> {
  const modules = ctx.unstable_modules;
  if (!modules) {
    throw new Error('handler middleware required (missing modules)');
  }
  const {
    default: { renderToReadableStream },
  } = modules.rdServer as { default: typeof RDServerType };
  const {
    default: { createFromReadableStream },
  } = modules.rsdwClient as { default: typeof RSDWClientType };
  const { INTERNAL_ServerRoot } =
    modules.wakuMinimalClient as typeof WakuMinimalClientType;

  const stream = await renderRsc(config, ctx, elements, onError);
  const htmlStream = renderRscElement(config, ctx, html, onError);
  const isDev = !!ctx.unstable_devServer;
  const moduleMap = new Proxy(
    {} as Record<string, Record<string, ImportManifestEntry>>,
    {
      get(_target, filePath: string) {
        return new Proxy(
          {},
          {
            get(_target, name: string) {
              if (isDev) {
                let id = filePath.slice(config.basePath.length);
                if (id.startsWith('@id/')) {
                  id = id.slice('@id/'.length);
                } else if (id.startsWith('@fs/')) {
                  id = filePathToFileURL(id.slice('@fs'.length));
                } else {
                  id = filePathToFileURL(id);
                }
                (globalThis as any).__WAKU_CLIENT_CHUNK_LOAD__(id);
                return { id, chunks: [id], name };
              }
              // !isDev
              const id = filePath.slice(config.basePath.length);
              (globalThis as any).__WAKU_CLIENT_CHUNK_LOAD__(id);
              return { id, chunks: [id], name };
            },
          },
        );
      },
    },
  );
  const [stream1, stream2] = stream.tee();
  const elementsPromise: Promise<Elements> = createFromReadableStream(stream1, {
    serverConsumerManifest: { moduleMap, moduleLoading: null },
  });
  const htmlNode: Promise<ReactNode> = createFromReadableStream(htmlStream, {
    serverConsumerManifest: { moduleMap, moduleLoading: null },
  });
  const { headCode, headModules, headElements } = parseHtmlHead(
    rscPath,
    htmlHead,
    isDev
      ? `${config.basePath}${(config as ConfigDev).srcDir}/${SRC_MAIN}`
      : '',
  );
  try {
    const readable = await renderToReadableStream(
      createElement(
        INTERNAL_ServerRoot as FunctionComponent<
          Omit<ComponentProps<typeof INTERNAL_ServerRoot>, 'children'>
        >,
        { elementsPromise },
        ...headElements,
        htmlNode as any,
      ),
      {
        bootstrapScriptContent: headCode,
        bootstrapModules: headModules,
        formState:
          actionResult === undefined
            ? null
            : await getExtractFormState(ctx)(actionResult),
        onError(err) {
          if (hackToIgnoreFirstTwoErrors) {
            return;
          }
          console.error(err);
          onError.forEach((fn) => fn(err, ctx as HandlerContext, 'html'));
          if (typeof (err as any)?.digest === 'string') {
            return (err as { digest: string }).digest;
          }
        },
      },
    );
    const injected: ReadableStream & { allReady?: Promise<void> } =
      readable.pipeThrough(injectRSCPayload(stream2));
    injected.allReady = readable.allReady;
    return injected as never;
  } catch (e) {
    if (hackToIgnoreFirstTwoErrors) {
      hackToIgnoreFirstTwoErrors--;
      return renderHtml(
        config,
        ctx,
        htmlHead,
        elements,
        onError,
        html,
        rscPath,
        actionResult,
      );
    }
    throw e;
  }
}
