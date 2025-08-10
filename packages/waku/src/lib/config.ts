import type { Config } from '../config.js';

export type BuiltinMiddleware =
  | 'waku/middleware/context'
  | 'waku/middleware/dev-server'
  | 'waku/middleware/handler';

export type ConfigDev = Required<Config>;

const DEFAULT_MIDDLEWARE: BuiltinMiddleware[] = [
  'waku/middleware/context',
  'waku/middleware/dev-server',
  'waku/middleware/handler',
];

// Keep async function for future extension
export async function resolveConfigDev(config: Config) {
  const configDev: ConfigDev = {
    basePath: '/',
    srcDir: 'src',
    distDir: 'dist',
    pagesDir: 'pages',
    apiDir: 'api',
    slicesDir: 'slices',
    privateDir: 'private',
    rscBase: 'RSC',
    middleware: DEFAULT_MIDDLEWARE,
    unstable_honoEnhancer: undefined,
    unstable_viteConfigs: undefined,
    vite: undefined,
    ...config,
  };
  return configDev;
}

export type ConfigPrd = Pick<Required<Config>, 'basePath' | 'rscBase'>;
