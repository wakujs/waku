import type { Config } from '../../config.js';

const getDefaultAdapter = () =>
  process.env.VERCEL
    ? 'waku/adapters/vercel'
    : process.env.NETLIFY
      ? 'waku/adapters/netlify'
      : process.env.CLOUDFLARE || process.env.WORKERS_CI
        ? 'waku/adapters/cloudflare'
        : 'waku/adapters/node';

/**
 * Fills omitted Waku configuration values with defaults.
 * The default adapter is selected from the current process environment.
 * @param config Optional configuration overrides.
 * @returns A complete configuration for Waku's Vite plugins.
 * @throws If `basePath` does not end with `/`.
 */
export function resolveConfig(config: Config | undefined): Required<Config> {
  const resolvedConfig: Required<Config> = {
    basePath: '/',
    srcDir: 'src',
    distDir: 'dist',
    privateDir: 'private',
    rscBase: 'RSC',
    unstable_adapter: getDefaultAdapter(),
    vite: undefined,
    ...config,
  };

  // ensure trailing slash
  if (!resolvedConfig.basePath.endsWith('/')) {
    throw new Error('basePath must end with /');
  }

  return resolvedConfig;
}
