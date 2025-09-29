import serverEntry from 'virtual:vite-rsc-waku/server-entry';

export { serverEntry };

export async function runFetch(req: Request, ...args: any[]) {
  // If we don't do anything here, there's no point to warp with runFetch
  return serverEntry.fetch(req, ...args);
}
