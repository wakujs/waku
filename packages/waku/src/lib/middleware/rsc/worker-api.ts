import { PassThrough } from "node:stream";
import type { Readable } from "node:stream";
import { Worker } from "node:worker_threads";

import type { GetBuildConfig } from "../../../server.js";

export type RenderRequest = {
  input: string;
  method: "GET" | "POST";
  headers: Record<string, string | string[] | undefined>;
  command: "dev" | "build" | "start";
  context: unknown;
  ssr: boolean;
  stream?: Readable;
  moduleIdCallback?: (id: string) => void;
};

const worker = new Worker(new URL("worker-impl.js", import.meta.url), {
  execArgv: [
    "--experimental-loader",
    "waku/node-loader",
    "--experimental-loader",
    "react-server-dom-webpack/node-loader",
    "--conditions",
    "react-server",
  ],
});

export type BuildOutput = {
  rscFiles: string[];
  htmlFiles: string[];
};

export type MessageReq =
  | { type: "shutdown" }
  | ({
      id: number;
      type: "render";
      moduleIdCallback: boolean;
    } & Omit<RenderRequest, "stream" | "moduleIdCallback">)
  | { id: number; type: "buf"; buf: ArrayBuffer; offset: number; len: number }
  | { id: number; type: "end" }
  | { id: number; type: "err"; err: unknown }
  | { id: number; type: "getBuildConfig" };

export type MessageRes =
  | { type: "full-reload" }
  | { type: "hot-import"; source: string }
  | { id: number; type: "start"; context: unknown }
  | { id: number; type: "buf"; buf: ArrayBuffer; offset: number; len: number }
  | { id: number; type: "end" }
  | { id: number; type: "err"; err: unknown; statusCode?: number }
  | { id: number; type: "moduleId"; moduleId: string }
  | {
      id: number;
      type: "buildConfig";
      output: Awaited<ReturnType<GetBuildConfig>>;
    };

const messageCallbacks = new Map<number, (mesg: MessageRes) => void>();

worker.on("message", (mesg: MessageRes) => {
  if ("id" in mesg) {
    messageCallbacks.get(mesg.id)?.(mesg);
  }
});

export function registerReloadCallback(fn: (type: "full-reload") => void) {
  const listener = (mesg: MessageRes) => {
    if (mesg.type === "full-reload") {
      fn(mesg.type);
    }
  };
  worker.on("message", listener);
  return () => worker.off("message", listener);
}

export function registerImportCallback(fn: (source: string) => void) {
  const listener = (mesg: MessageRes) => {
    if (mesg.type === "hot-import") {
      fn(mesg.source);
    }
  };
  worker.on("message", listener);
  return () => worker.off("message", listener);
}

export function shutdown(): Promise<void> {
  return new Promise((resolve) => {
    worker.on("close", resolve);
    const mesg: MessageReq = { type: "shutdown" };
    worker.postMessage(mesg);
  });
}

let nextId = 1;

export function renderRSC<Context>(
  rr: RenderRequest,
): Promise<readonly [Readable, Context]> {
  const id = nextId++;
  const pipe = async () => {
    if (rr.stream) {
      rr.stream.on("error", (err: unknown) => {
        const mesg: MessageReq = { id, type: "err", err };
        worker.postMessage(mesg);
      });
      for await (const chunk of rr.stream) {
        const buffer: Buffer = chunk;
        const mesg: MessageReq = {
          id,
          type: "buf",
          buf: buffer.buffer,
          offset: buffer.byteOffset,
          len: buffer.length,
        };
        worker.postMessage(mesg);
      }
    }
    const mesg: MessageReq = { id, type: "end" };
    worker.postMessage(mesg);
  };
  let started = false;
  return new Promise((resolve, reject) => {
    const passthrough = new PassThrough();
    messageCallbacks.set(id, (mesg) => {
      if (mesg.type === "start") {
        if (!started) {
          started = true;
          resolve([passthrough, mesg.context as Context]);
        } else {
          throw new Error("already started");
        }
      } else if (mesg.type === "buf") {
        if (!started) {
          throw new Error("not yet started");
        }
        passthrough.write(Buffer.from(mesg.buf, mesg.offset, mesg.len));
      } else if (mesg.type === "moduleId") {
        rr.moduleIdCallback?.(mesg.moduleId);
      } else if (mesg.type === "end") {
        if (!started) {
          throw new Error("not yet started");
        }
        passthrough.end();
        messageCallbacks.delete(id);
      } else if (mesg.type === "err") {
        const err =
          mesg.err instanceof Error ? mesg.err : new Error(String(mesg.err));
        if (mesg.statusCode) {
          (err as any).statusCode = mesg.statusCode;
        }
        if (!started) {
          reject(err);
        } else {
          passthrough.destroy(err);
        }
        messageCallbacks.delete(id);
      }
    });
    const mesg: MessageReq = {
      id,
      type: "render",
      moduleIdCallback: !!rr.moduleIdCallback,
      input: rr.input,
      method: rr.method,
      headers: rr.headers,
      command: rr.command,
      context: rr.context,
      ssr: rr.ssr,
    };
    worker.postMessage(mesg);
    pipe();
  });
}

export function getBuildConfigRSC(): ReturnType<GetBuildConfig> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    messageCallbacks.set(id, (mesg) => {
      if (mesg.type === "buildConfig") {
        resolve(mesg.output);
        messageCallbacks.delete(id);
      } else if (mesg.type === "err") {
        reject(mesg.err);
        messageCallbacks.delete(id);
      }
    });
    const mesg: MessageReq = { id, type: "getBuildConfig" };
    worker.postMessage(mesg);
  });
}
