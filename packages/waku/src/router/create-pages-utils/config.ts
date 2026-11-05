import type { ReactNode } from 'react';
import type { defineRouter } from '../define-router.js';
import type { PathSpec } from '../isomorphic-utils/path-spec.js';
import type { SearchCodec } from '../isomorphic-utils/search-codec.js';

export type ApiHandler = (
  req: Request,
  apiContext: { params: Record<string, string | string[]> },
) => Promise<Response>;

export type HandlerInterceptor = NonNullable<
  Parameters<typeof defineRouter>[0]['unstable_interceptors']
>[number];

type SlotId = string;

export type RendererOptions = { routePath: string; query: string | undefined };

type GetEtagFromOptions = (
  options: RendererOptions,
) => Promise<string | undefined>;
type GetEtagFromParams = (
  params?: Record<string, string | string[]>,
) => Promise<string | undefined>;

export type RouteConfig = {
  type: 'route';
  pathSpec: PathSpec;
  isStatic: boolean;
  pathPatternSpec?: PathSpec;
  rootElement: {
    isStatic: boolean;
    renderer: (options: RendererOptions) => ReactNode;
    getEtagFromOptions?: GetEtagFromOptions;
    sourceFile?: string;
  };
  routeElement: {
    isStatic: boolean;
    renderer: (options: RendererOptions) => ReactNode;
    getEtagFromOptions?: GetEtagFromOptions;
  };
  elements: Record<
    SlotId,
    {
      isStatic: boolean;
      renderer: (options: RendererOptions) => ReactNode;
      getEtagFromOptions?: GetEtagFromOptions;
      sourceFile?: string;
    }
  >;
  noSsr?: boolean;
  slices?: string[];
  searchCodec?: SearchCodec<any>;
};

type ApiConfig = {
  type: 'api';
  pathSpec: PathSpec;
  isStatic: boolean;
  handler: ApiHandler;
  sourceFile?: string;
};

export type SliceConfig = {
  type: 'slice';
  id: string;
  pathSpec?: PathSpec;
  isStatic: boolean;
  renderer: (params?: Record<string, string | string[]>) => Promise<ReactNode>;
  getEtagFromParams?: GetEtagFromParams;
  sourceFile?: string;
};

export type RuntimeConfig = RouteConfig | ApiConfig | SliceConfig;

export function getPathSpecKey(p: PathSpec) {
  return JSON.stringify(p);
}
