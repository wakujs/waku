import type { Config } from '../../config.js';

export type ConfigDev = Required<Config>;

export type ConfigPrd = Pick<Required<Config>, 'basePath' | 'rscBase'>;
