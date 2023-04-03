import path from "node:path";

import { createElement } from "react";
import RSDWServer from "react-server-dom-webpack/server";
import busboy from "busboy";

import type { MiddlewareCreator } from "./common.js";
import type { GetEntry, Prefetcher } from "../server.js";

const { renderToPipeableStream, decodeReply, decodeReplyFromBusboy } =
  RSDWServer;

const CLIENT_REFERENCE = Symbol.for("react.client.reference");

// TODO we have duplicate code here and rscDev.ts

const rscPrd: MiddlewareCreator = (config, shared) => {
  const dir = path.resolve(config.prdServer?.dir || ".");
  const basePath = config.build?.basePath || "/"; // FIXME it's not build only

  const entriesFile = path.join(dir, config.files?.entriesJs || "entries.js");
  const getEntry: GetEntry = async (rscId) => {
    const mod = await import(entriesFile);
    return mod.getEntry(rscId);
  };
  const prefetcher: Prefetcher = async (pathItem) => {
    const mod = await import(entriesFile);
    return mod.prefetcher(pathItem);
  };
  let clientEntries: Record<string, string> | undefined;
  import(entriesFile).then((mod) => {
    clientEntries = mod.clientEntries;
  });

  const getFunctionComponent = async (rscId: string) => {
    if (!getEntry) {
      return null;
    }
    const mod = await getEntry(rscId);
    if (typeof mod === "function") {
      return mod;
    }
    return mod.default;
  };

  const getClientEntry = (id: string) => {
    if (!clientEntries) {
      throw new Error("Missing client entries");
    }
    const clientEntry =
      clientEntries[id!] ||
      clientEntries[id!.replace(/\.js$/, ".ts")] ||
      clientEntries[id!.replace(/\.js$/, ".tsx")];
    if (!clientEntry) {
      throw new Error("No client entry found");
    }
    return clientEntry;
  };

  const decodeId = (encodedId: string): [id: string, name: string] => {
    let [id, name] = encodedId.split("#") as [string, string];
    if (!id.startsWith("wakuwork/")) {
      id = path.relative("file://" + encodeURI(dir), id);
      id = basePath + getClientEntry(decodeURI(id));
    }
    return [id, name];
  };

  shared.prdScriptToInject = async (path: string) => {
    let code = "";
    if (prefetcher) {
      const { entryItems = [], clientModules = [] } = await prefetcher(path);
      const moduleIds: string[] = [];
      for (const m of clientModules as any[]) {
        if (m["$$typeof"] !== CLIENT_REFERENCE) {
          throw new Error("clientModules must be client references");
        }
        const [id] = decodeId(m["$$id"]);
        moduleIds.push(id);
      }
      code += shared.generatePrefetchCode?.(entryItems, moduleIds) || "";
    }
    return code;
  };

  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [id, name] = decodeId(encodedId);
        return { id, chunks: [], name, async: true };
      },
    }
  );

  return async (req, res, next) => {
    const rscId = req.headers["x-react-server-component-id"];
    const rsfId = req.headers["x-react-server-function-id"];
    if (typeof rsfId === "string") {
      // FIXME We should not send the URL (with full path) to the client.
      // This should be fixed. Not for production use.
      // https://github.com/facebook/react/blob/93c10dfa6b0848c12189b773b59c77d74cad2a1a/packages/react-server-dom-webpack/src/ReactFlightClientNodeBundlerConfig.js#L47
      const [id, name] = decodeId(rsfId);
      const fname = path.join(dir, id);
      let args: unknown[] = [];
      if (req.headers["content-type"]?.startsWith("multipart/form-data")) {
        const bb = busboy({ headers: req.headers });
        const reply = decodeReplyFromBusboy(bb);
        req.pipe(bb);
        args = await reply;
      } else {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        if (body) {
          args = await decodeReply(body);
        }
      }
      const mod = await import(fname);
      const data = await (mod[name!] || mod)(...args);
      if (typeof rscId !== "string") {
        res.setHeader("Content-Type", "text/x-component");
        renderToPipeableStream(data, bundlerConfig).pipe(res);
        return;
      }
      // continue for mutation mode
    }
    if (typeof rscId === "string") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
      }
      const props: {} = JSON.parse(
        body ||
          (req.headers["x-react-server-component-props"] as
            | string
            | undefined) ||
          "{}"
      );
      const component = await getFunctionComponent(rscId);
      if (component) {
        res.setHeader("Content-Type", "text/x-component");
        renderToPipeableStream(
          createElement(component, props),
          bundlerConfig
        ).pipe(res);
        return;
      }
      res.statusCode = 404;
      res.end();
    }
    await next();
  };
};

export default rscPrd;
