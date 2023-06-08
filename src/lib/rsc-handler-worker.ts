import path from "node:path";
import fs from "node:fs";
import { parentPort } from "node:worker_threads";
import { Writable } from "node:stream";

import { createServer } from "vite";
import { createElement } from "react";
import RSDWServer from "react-server-dom-webpack/server";

import { configFileConfig, resolveConfig } from "./config.js";
import { transformRsfId, generatePrefetchCode } from "./rsc-utils.js";
import type { MessageReq, MessageRes, BuildOutput } from "./rsc-handler.js";
import { defineEntries } from "../server.js";
import type { RenderInput } from "../server.js";
import { rscTransformPlugin, rscReloadPlugin } from "./vite-plugin-rsc.js";

const { renderToPipeableStream } = RSDWServer;

type Entries = { default: ReturnType<typeof defineEntries> };
type PipeableStream = { pipe<T extends Writable>(destination: T): T };

const handleSetClientEntries = async (
  mesg: MessageReq & { type: "setClientEntries" }
) => {
  const { id, value, command } = mesg;
  try {
    await setClientEntries(value, command);
    const mesg: MessageRes = { id, type: "end" };
    parentPort!.postMessage(mesg);
  } catch (err) {
    const mesg: MessageRes = { id, type: "err", err };
    parentPort!.postMessage(mesg);
  }
};

const handleRender = async (mesg: MessageReq & { type: "render" }) => {
  const { id, input } = mesg;
  try {
    const pipeable = await renderRSC(input);
    const writable = new Writable({
      write(chunk, encoding, callback) {
        if (encoding !== ("buffer" as any)) {
          throw new Error("Unknown encoding");
        }
        const buffer: Buffer = chunk;
        const mesg: MessageRes = {
          id,
          type: "buf",
          buf: buffer.buffer,
          offset: buffer.byteOffset,
          len: buffer.length,
        };
        parentPort!.postMessage(mesg, [mesg.buf]);
        callback();
      },
      final(callback) {
        const mesg: MessageRes = { id, type: "end" };
        parentPort!.postMessage(mesg);
        callback();
      },
    });
    pipeable.pipe(writable);
  } catch (err) {
    const mesg: MessageRes = { id, type: "err", err };
    parentPort!.postMessage(mesg);
  }
};

const handleBuild = async (mesg: MessageReq & { type: "build" }) => {
  const { id } = mesg;
  try {
    const output = await buildRSC();
    const mesg: MessageRes = { id, type: "buildOutput", output };
    parentPort!.postMessage(mesg);
  } catch (err) {
    const mesg: MessageRes = { id, type: "err", err };
    parentPort!.postMessage(mesg);
  }
};

const vitePromise = createServer({
  ...configFileConfig,
  plugins: [
    rscTransformPlugin(),
    rscReloadPlugin((type) => {
      const mesg: MessageRes = { type };
      parentPort!.postMessage(mesg);
    }),
  ],
  ssr: {
    // FIXME Without this, "use client" directive in waku/router/client
    // is ignored, and some errors occur.
    // Unless we fix this, RSC-capable packages aren't supported.
    // This also seems to cause problems with pnpm.
    noExternal: ["waku"],
  },
  appType: "custom",
});

const shutdown = async () => {
  const vite = await vitePromise;
  await vite.close();
  parentPort!.close();
};

const loadServerFile = async (fname: string) => {
  const vite = await vitePromise;
  return vite.ssrLoadModule(fname);
};

parentPort!.on("message", (mesg: MessageReq) => {
  if (mesg.type === "shutdown") {
    shutdown();
  } else if (mesg.type === "setClientEntries") {
    handleSetClientEntries(mesg);
  } else if (mesg.type === "render") {
    handleRender(mesg);
  } else if (mesg.type === "build") {
    handleBuild(mesg);
  }
});

// FIXME using mutable module variable doesn't seem nice. Let's revisit this.
let resolvedConfig: Awaited<ReturnType<typeof resolveConfig>> | undefined;

const getEntriesFile = async () => {
  if (!resolvedConfig) {
    throw new Error("config is not ready");
  }
  const config = resolvedConfig;
  if (config.command === "build") {
    return path.join(
      config.root,
      config.build.outDir,
      config.framework.entriesJs
    );
  }
  return path.join(config.root, config.framework.entriesJs);
};

const getFunctionComponent = async (rscId: string) => {
  const entriesFile = await getEntriesFile();
  const {
    default: { getEntry },
  } = await (loadServerFile(entriesFile) as Promise<Entries>);
  const mod = await getEntry(rscId);
  if (typeof mod === "function") {
    return mod;
  }
  if (typeof mod?.default === "function") {
    return mod?.default;
  }
  throw new Error("No function component found");
};

let absoluteClientEntries: Record<string, string> = {};

const resolveClientEntry = (filePath: string) => {
  if (!resolvedConfig) {
    throw new Error("config is not ready");
  }
  const config = resolvedConfig;
  const clientEntry = absoluteClientEntries[filePath];
  if (!clientEntry) {
    if (absoluteClientEntries["*"] === "*") {
      return config.base + path.relative(config.root, filePath);
    }
    throw new Error("No client entry found for " + filePath);
  }
  return clientEntry;
};

async function setClientEntries(
  value: "load" | Record<string, string>,
  command: "serve" | "build"
): Promise<void> {
  if (value !== "load") {
    absoluteClientEntries = value;
    return;
  }
  if (!resolvedConfig) {
    resolvedConfig = await resolveConfig(command);
  }
  const config = resolvedConfig;
  const entriesFile = await getEntriesFile();
  const { clientEntries } = await loadServerFile(entriesFile);
  if (!clientEntries) {
    throw new Error("Failed to load clientEntries");
  }
  const baseDir = path.dirname(entriesFile);
  absoluteClientEntries = Object.fromEntries(
    Object.entries(clientEntries).map(([key, val]) => [
      path.join(baseDir, key),
      config.base + val,
    ])
  );
}

async function renderRSC(
  input: RenderInput,
  clientModuleCallback?: (id: string) => void
): Promise<PipeableStream> {
  if (!resolvedConfig) {
    resolvedConfig = await resolveConfig("serve");
  }
  const config = resolvedConfig;
  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [filePath, name] = encodedId.split("#") as [string, string];
        const id = resolveClientEntry(filePath);
        clientModuleCallback?.(id);
        return { id, chunks: [id], name, async: true };
      },
    }
  );

  if ("rsfId" in input) {
    const [fileId, name] = input.rsfId.split("#");
    const fname = path.join(config.root, fileId!);
    const mod = await loadServerFile(fname);
    const data = await (mod[name!] || mod)(...input.args);
    if (!("rscId" in input)) {
      return renderToPipeableStream(data, bundlerConfig);
    }
    // continue for mutation mode
  }
  if ("rscId" in input) {
    const component = await getFunctionComponent(input.rscId);
    return renderToPipeableStream(
      createElement(component, input.props as any),
      bundlerConfig
    ).pipe(transformRsfId(config.root));
  }
  throw new Error("Unexpected input");
}

// FIXME this may take too much responsibility
async function buildRSC(): Promise<BuildOutput> {
  if (!resolvedConfig) {
    resolvedConfig = await resolveConfig("build");
  }
  const config = resolvedConfig;
  const basePrefix = config.base + config.framework.rscPrefix;
  const distEntriesFile = await getEntriesFile();
  const {
    default: { getBuilder },
  } = await (loadServerFile(distEntriesFile) as Promise<Entries>);
  if (!getBuilder) {
    console.warn(
      "getBuilder is undefined. It's recommended for optimization and sometimes required."
    );
    return { rscFiles: [], htmlFiles: [] };
  }

  const pathMap = await getBuilder(config.root, renderRSC);
  const clientModuleMap = new Map<string, Set<string>>();
  const addClientModule = (
    rscId: string,
    serializedProps: string,
    id: string
  ) => {
    const key = rscId + "/" + serializedProps;
    let idSet = clientModuleMap.get(key);
    if (!idSet) {
      idSet = new Set();
      clientModuleMap.set(key, idSet);
    }
    idSet.add(id);
  };
  const getClientModules = (rscId: string, serializedProps: string) => {
    const key = rscId + "/" + serializedProps;
    const idSet = clientModuleMap.get(key);
    return Array.from(idSet || []);
  };
  const rscFileSet = new Set<string>(); // XXX could be implemented better
  await Promise.all(
    Object.entries(pathMap).map(async ([, { elements }]) => {
      for (const [rscId, props] of elements || []) {
        // FIXME we blindly expect JSON.stringify usage is deterministic
        const serializedProps = JSON.stringify(props);
        const searchParams = new URLSearchParams();
        searchParams.set("props", serializedProps);
        const destFile = path.join(
          config.root,
          config.build.outDir,
          config.framework.outPublic,
          config.framework.rscPrefix + decodeURIComponent(rscId),
          decodeURIComponent(`${searchParams}`)
        );
        if (!rscFileSet.has(destFile)) {
          rscFileSet.add(destFile);
          fs.mkdirSync(path.dirname(destFile), { recursive: true });
          const pipeable = await renderRSC({ rscId, props }, (id) =>
            addClientModule(rscId, serializedProps, id)
          );
          await new Promise<void>((resolve, reject) => {
            const stream = fs.createWriteStream(destFile);
            stream.on("finish", resolve);
            stream.on("error", reject);
            pipeable.pipe(stream);
          });
        }
      }
    })
  );

  const publicIndexHtmlFile = path.join(
    config.root,
    config.build.outDir,
    config.framework.outPublic,
    config.framework.indexHtml
  );
  const publicIndexHtml = fs.readFileSync(publicIndexHtmlFile, {
    encoding: "utf8",
  });
  const htmlFiles = await Promise.all(
    Object.entries(pathMap).map(async ([pathStr, { elements, customCode }]) => {
      const destFile = path.join(
        config.root,
        config.build.outDir,
        config.framework.outPublic,
        pathStr,
        pathStr.endsWith("/") ? "index.html" : ""
      );
      let data = "";
      if (fs.existsSync(destFile)) {
        data = fs.readFileSync(destFile, { encoding: "utf8" });
      } else {
        fs.mkdirSync(path.dirname(destFile), { recursive: true });
        data = publicIndexHtml;
      }
      const code =
        generatePrefetchCode(
          basePrefix,
          Array.from(elements || []).flatMap(([rscId, props, skipPrefetch]) => {
            if (skipPrefetch) {
              return [];
            }
            return [[rscId, props]];
          }),
          Array.from(elements || []).flatMap(([rscId, props]) => {
            // FIXME we blindly expect JSON.stringify usage is deterministic
            const serializedProps = JSON.stringify(props);
            return getClientModules(rscId, serializedProps);
          })
        ) + (customCode || "");
      if (code) {
        // HACK is this too naive to inject script code?
        data = data.replace(/<\/body>/, `<script>${code}</script></body>`);
      }
      fs.writeFileSync(destFile, data, { encoding: "utf8" });
      return destFile;
    })
  );
  return { rscFiles: Array.from(rscFileSet), htmlFiles };
}
