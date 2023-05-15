import RSDWServer from "react-server-dom-webpack/server.node.unbundled";
import busboy from "busboy";

import type { MiddlewareCreator } from "./lib/common.js";
import { renderRSC, prefetcherRSC } from "./lib/rsc-handler.js";

const { decodeReply, decodeReplyFromBusboy } = RSDWServer;

// TODO we have duplicate code here and rsc-handler-worker.ts

const rscPrd: MiddlewareCreator = (_config, shared) => {
  shared.prdScriptToInject = async (pathItem: string) => {
    const code = await prefetcherRSC(pathItem, true);
    return code;
  };

  return async (req, res, next) => {
    const rscId = req.headers["x-react-server-component-id"];
    const rsfId = req.headers["x-react-server-function-id"];
    if (Array.isArray(rscId) || Array.isArray(rsfId)) {
      throw new Error("rscId and rsfId should not be array");
    }
    let props = {};
    if (rscId) {
      res.setHeader("Content-Type", "text/x-component");
      props = JSON.parse(
        (req.headers["x-react-server-component-props"] as string | undefined) ||
          "{}"
      );
    }
    let args: unknown[] = [];
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
    if (rscId || rsfId) {
      renderRSC({ rscId, props, rsfId, args }, true).pipe(res);
      return;
    }
    await next();
  };
};

export default rscPrd;
