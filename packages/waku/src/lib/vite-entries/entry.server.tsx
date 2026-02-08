import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { INTERNAL_setAllEnv } from '../../server.js';
import type { Unstable_EmitFile } from '../types.js';
import { joinPath } from '../utils/path.js';
import { produceMultiplexedStream, stringToStream } from '../utils/stream.js';

export { serverEntry as unstable_serverEntry };

export async function INTERNAL_runFetch(
  env: Readonly<Record<string, string>>,
  req: Request,
  ...args: any[]
) {
  INTERNAL_setAllEnv(env);
  if (typeof globalThis.__WAKU_RUN_BUILD_ROOT_DIR__ === 'string') {
    const body = await runBuild(globalThis.__WAKU_RUN_BUILD_ROOT_DIR__);
    return new Response(body);
  }
  return serverEntry.fetch(req, ...args);
}

async function runBuild(rootDir: string): Promise<ReadableStream> {
  let build = serverEntry.build;
  for (const enhancer of serverEntry.buildEnhancers || []) {
    const moduleId = await resolveModuleId(enhancer, rootDir);
    const mod = await import(moduleId);
    build = await mod.default(build);
  }
  return produceMultiplexedStream(async (emit) => {
    const emitFile: Unstable_EmitFile = async (path, body) => {
      await emit(path, typeof body === 'string' ? stringToStream(body) : body);
    };
    await build({ emitFile }, serverEntry.buildOptions || {});
  });
}

async function resolveModuleId(moduleId: string, rootDir: string) {
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  if (moduleId.startsWith('file://')) {
    return moduleId;
  }
  if (moduleId.startsWith('/')) {
    // treat as project-root relative (not filesystem root)
    return pathToFileURL(joinPath(rootDir, moduleId.slice(1))).href;
  }
  const require = createRequire(joinPath(rootDir, 'DUMMY.js'));
  const resolved = require.resolve(moduleId);
  return pathToFileURL(resolved).href;
}
