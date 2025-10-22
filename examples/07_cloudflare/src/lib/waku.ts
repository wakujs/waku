import { getEnv as getWakuEnv } from 'waku';
import { getHonoContext } from '../server-entry';

export function isBuild() {
  return !!(globalThis as any).__WAKU_IS_BUILD__;
}

export function getEnv(key: string): string | undefined {
  if (isBuild()) {
    // Environment variables present at build time in process.env
    return getWakuEnv(key);
  }
  const c = getHonoContext();
  if (!c) {
    return undefined;
  }
  // Runtime Cloudflare environment variables
  // https://developers.cloudflare.com/workers/configuration/environment-variables/
  const env = (c.env || {}) as unknown as Record<string, string | undefined>;
  return env[key];
}
