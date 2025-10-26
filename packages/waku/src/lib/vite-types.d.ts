/// <reference types="vite/client" />
/// <reference types="@vitejs/plugin-rsc/types" />

declare module 'virtual:vite-rsc-waku/server-entry' {
  const default_: import('./types.ts').Unstable_ServerEntry['default'];
  export default default_;
}

declare module 'virtual:vite-rsc-waku/client-entry' {}

declare module 'virtual:vite-rsc-waku/config' {
  export const rootDir: string;
  export const config: Omit<Required<import('../config.ts').Config>, 'vite'>;
  export const isBuild: boolean;
  export const globSrcPages: Record<string, () => Promise<unknown>>;
}

declare module 'virtual:vite-rsc-waku/fallback-html' {
  const default_: string;
  export default default_;
}
