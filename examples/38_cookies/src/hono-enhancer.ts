import type { Hono } from 'hono';
import { contextStorage, getContext } from 'hono/context-storage';

export const getHonoContext = ((globalThis as any).__WAKU_GET_HONO_CONTEXT__ ||=
  getContext);

const honoEnhancer = (createApp: (app: Hono) => Hono) => {
  return (appToCreate: Hono) => {
    appToCreate.use(contextStorage());
    const app = createApp(appToCreate);
    return app;
  };
};

export default honoEnhancer;
