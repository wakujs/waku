export async function startPreviewServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const start = globalThis.__WAKU_START_PREVIEW_SERVER__;
  if (!start) {
    throw new Error('Preview server is not available.');
  }
  return start();
}
