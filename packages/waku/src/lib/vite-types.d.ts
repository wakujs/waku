/// <reference types="vite/client" />
/// <reference types="@vitejs/plugin-rsc/types" />

declare module 'virtual:vite-rsc-waku/server-entry' {
  const default_: import('./types.ts').EntriesDev['default'];
  export default default_;
}

declare module 'virtual:vite-rsc-waku/client-entry' {}

declare module 'react-dom/server.edge' {
  export * from 'react-dom/server';
}

declare module 'virtual:vite-rsc-waku/set-platform-data' {}

declare module 'virtual:vite-rsc-waku/middlewares' {
  export const middlewares: import('../config.ts').Middleware[];
}

declare module 'virtual:vite-rsc-waku/hono-enhancer' {
  export const honoEnhancer: import('../cli.ts').HonoEnhancer;
}

declare module 'virtual:vite-rsc-waku/config' {
  export const flags: import('./vite-rsc/plugin.ts').Flags;
  export const config: import('./config/types.ts').ConfigDev;
  export const isBuild: boolean;
}

declare module 'virtual:vite-rsc-waku/fallback-html' {
  const default_: string;
  export default default_;
}
