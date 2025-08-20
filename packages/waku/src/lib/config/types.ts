import type { Config } from '../../config.js';

export type BuiltinMiddleware =
  | 'waku/middleware/context'
  | 'waku/middleware/dev-server'
  | 'waku/middleware/handler';

export type ConfigDev = Required<Config>;

export type ConfigPrd = Pick<Required<Config>, 'basePath' | 'rscBase'>;
