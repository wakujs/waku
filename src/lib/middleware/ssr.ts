import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { Readable, PassThrough } from "node:stream";

import RDServer from "react-dom/server";
import RSDWClient from "react-server-dom-webpack/client.node.unbundled";
import { createServer as viteCreateServer } from "vite";

import { configFileConfig, resolveConfig } from "../config.js";
import { defineEntries } from "../../server.js";
import type { GetSsrConfig } from "../../server.js";
import { nonjsResolvePlugin } from "../vite-plugin/nonjs-resolve-plugin.js";

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void
) => void;

type Entries = { default: ReturnType<typeof defineEntries> };

// eslint-disable-next-line import/no-named-as-default-member
const { renderToPipeableStream } = RDServer;
const { createFromNodeStream } = RSDWClient;

// TODO make it configurable
const splitHTML = (htmlStr: string): readonly [string, string] => {
  const splitted = htmlStr.split(/\s*<div class="spinner"><\/div>\s*/);
  if (splitted.length !== 2) {
    throw new Error("Failed to split HTML");
  }
  return [splitted[0] as string, splitted[1] as string];
};

const bundlerConfig = new Proxy(
  {},
  {
    get() {
      return new Proxy(
        {},
        {
          get() {
            return { specifier: "waku/server", name: "ClientOnly" };
          },
        }
      );
    },
  }
);

const renderHTML = (
  pathStr: string,
  rscServer: URL,
  ssrConfig: NonNullable<Awaited<ReturnType<GetSsrConfig>>>
): Readable => {
  const htmlResPromise = fetch(rscServer + pathStr, {
    headers: { "x-waku-skip-ssr": "true" },
  });
  const [rscId, props] = ssrConfig.element;
  // FIXME we blindly expect JSON.stringify usage is deterministic
  const serializedProps = JSON.stringify(props);
  const searchParams = new URLSearchParams();
  searchParams.set("props", serializedProps);
  const rscResPromise = fetch(rscServer + rscId + "/" + searchParams);
  const passthrough = new PassThrough();
  Promise.all([htmlResPromise, rscResPromise]).then(
    async ([htmlRes, rscRes]) => {
      if (!htmlRes.ok) {
        // TODO error handling
        passthrough.destroy(new Error("TODO error handling"));
        return;
      }
      if (!rscRes.ok) {
        // TODO error handling
        passthrough.destroy(new Error("TODO error handling"));
        return;
      }
      if (!htmlRes.body || !rscRes.body) {
        passthrough.destroy(new Error("No body"));
        return;
      }
      const htmlStr = await htmlRes.text(); // Hope stream works, but it'd be too tricky
      const [preamble, postamble] = splitHTML(htmlStr);
      passthrough.write(preamble, "utf8");
      const data = createFromNodeStream(
        Readable.fromWeb(rscRes.body as any), // FIXME how to avoid any?
        bundlerConfig
      );
      const origEnd = passthrough.end;
      passthrough.end = (...args) => {
        passthrough.write(postamble, "utf8");
        return origEnd.apply(passthrough, args as any); // FIXME how to avoid any?
      };
      renderToPipeableStream(data, {
        onError(err) {
          if (
            err instanceof Error &&
            err.message.startsWith("Client-only component found.")
          ) {
            // ignore
            return;
          }
          console.error(err);
        },
      }).pipe(passthrough);
    }
  );
  return passthrough;
};

// Important note about the middleware design:
// - We assume and support using ssr and rsc middleware on different machines.
export function ssr(options: {
  mode: "development" | "production";
}): Middleware {
  const configPromise = resolveConfig("serve");
  const vitePromise = viteCreateServer({
    ...configFileConfig,
    plugins: [
      ...(options.mode === "development" ? [nonjsResolvePlugin()] : []),
    ],
    appType: "custom",
  });
  const getSsrConfigPromise = vitePromise.then(async (vite) => {
    const config = await configPromise;
    const entriesFile = path.join(config.root, config.framework.entriesJs);
    const {
      default: { getSsrConfig },
    } = await (vite.ssrLoadModule(entriesFile) as Promise<Entries>);
    return getSsrConfig;
  });
  return async (req, res, next) => {
    const [config, getSsrConfig] = await Promise.all([
      configPromise,
      getSsrConfigPromise,
    ]);
    if (req.url && !req.headers["x-waku-skip-ssr"]) {
      const ssrConfig = getSsrConfig && (await getSsrConfig(req.url));
      if (ssrConfig) {
        const rscServer = new URL(
          config.framework.rscServer + config.framework.rscPrefix,
          "http://" + req.headers.host
        );
        const readable = renderHTML(req.url, rscServer, ssrConfig);
        readable.on("error", (err) => {
          console.info("Cannot render HTML", err);
          res.statusCode = 500;
          if (options.mode === "development") {
            res.end(String(err));
          } else {
            res.end();
          }
        });
        readable.pipe(res);
        return;
      }
    }
    next();
  };
}
