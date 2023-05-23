import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { createServer as viteCreateServer } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import RSDWServer from "react-server-dom-webpack/server.node.unbundled";
import busboy from "busboy";

import type { FrameworkConfig } from "./config.js";
import { codeToInject } from "./lib/rsc-utils.js";
import {
  registerReloadCallback,
  setClientEntries,
  renderRSC,
} from "./lib/rsc-handler.js";

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void
) => void;

const { decodeReply, decodeReplyFromBusboy } = RSDWServer;

const createRscMiddleware = (): Middleware => {
  return async (req, res, next) => {
    const url = new URL(req.url || "", "http://" + req.headers.host);
    let rscId: string | undefined;
    let props = {};
    let rsfId: string | undefined;
    let args: unknown[] = [];
    if (url.pathname.startsWith("/RSC/")) {
      const index = url.pathname.lastIndexOf("/");
      rscId = url.pathname.slice("/RSC/".length, index);
      const params = new URLSearchParams(url.pathname.slice(index + 1));
      if (rscId && rscId !== "_") {
        res.setHeader("Content-Type", "text/x-component");
        props = JSON.parse(params.get("props") || "{}");
      } else {
        rscId = undefined;
      }
      rsfId = params.get("action_id") || undefined;
      if (rsfId) {
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
      }
    }
    if (rscId || rsfId) {
      const pipeable = renderRSC({ rscId, props, rsfId, args });
      pipeable.on("error", (err) => {
        console.info("Cannot render RSC", err);
        res.statusCode = 500;
        res.end(String(err));
      });
      pipeable.pipe(res);
      return;
    }
    next();
  };
};

const rscIndexPlugin = (): Plugin => {
  return {
    name: "rsc-index-plugin",
    async transformIndexHtml() {
      return [
        {
          tag: "script",
          children: codeToInject,
          injectTo: "body",
        },
      ];
    },
  };
};

const createViteMiddleware = (): Middleware => {
  const vitePromise = viteCreateServer({
    ...(process.env.CONFIG_FILE && { configFile: process.env.CONFIG_FILE }),
    optimizeDeps: {
      include: ["react-server-dom-webpack/client"],
      // FIXME without this, waku router has dual module hazard,
      // and "Uncaught Error: Missing Router" happens.
      exclude: ["waku"],
    },
    plugins: [
      // @ts-ignore
      react(),
      rscIndexPlugin(),
    ],
    server: { middlewareMode: true },
    appType: "custom",
  });
  vitePromise.then((vite) => {
    registerReloadCallback((type) => vite.ws.send({ type }));
  });
  return async (req, res, next) => {
    const vite = await vitePromise;
    const absoluteClientEntries = Object.fromEntries(
      Array.from(vite.moduleGraph.idToModuleMap.values()).map(
        ({ file, url }) => [file, url]
      )
    );
    absoluteClientEntries["*"] = "*"; // HACK to use fallback resolver
    // FIXME this is bad in performance, let's revisit it
    await setClientEntries(absoluteClientEntries);
    const indexFallback = async () => {
      const url = new URL(req.url || "", "http://" + req.headers.host);
      // TODO make it configurable?
      const hasExtension = url.pathname.split(".").length > 1;
      if (!hasExtension) {
        const { framework: frameworkConfig } = vite.config as {
          framework?: FrameworkConfig;
        };
        const fname = path.join(
          vite.config.root,
          frameworkConfig?.indexHtml || "index.html"
        );
        if (fs.existsSync(fname)) {
          let content = await fsPromises.readFile(fname, {
            encoding: "utf-8",
          });
          content = await vite.transformIndexHtml(req.url || "", content);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(content);
          return;
        }
        res.statusCode = 404;
        res.end();
        return;
      }
      next();
    };
    vite.middlewares(req, res, indexFallback);
  };
};

export function rsc(options: {
  mode: "development" | "production";
}): Middleware {
  if (options.mode === "production") {
    throw new Error("under construction");
  }
  const rscMiddleware = createRscMiddleware();
  const viteMiddleware = createViteMiddleware();
  return (req, res, next) => {
    rscMiddleware(req, res, (err) => {
      if (err) {
        return next(err);
      }
      viteMiddleware(req, res, next);
    });
  };
}
