import type { Config } from '../../config.js';

/** @deprecated Use `Config` instead. */
export type ConfigDev = Required<Config>;

/** @deprecated Use `Config` instead. */
export type ConfigPrd = Pick<Required<Config>, 'basePath' | 'rscBase'>;
