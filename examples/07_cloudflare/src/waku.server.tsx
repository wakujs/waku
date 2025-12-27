import { env, waitUntil } from 'cloudflare:workers'; // eslint-disable-line import/no-unresolved
import { contextStorage } from 'hono/context-storage';
import { fsRouter } from 'waku';
import adapter from 'waku/adapters/cloudflare';

const adapterExports = adapter(
  fsRouter(import.meta.glob('./**/*.tsx', { base: './pages' })),
  { middlewareFns: [contextStorage] },
);

export default {
  ...adapterExports,
  fetch: (req: Request): Response | Promise<Response> => {
    return adapterExports.fetch(req, env, { waitUntil });
  },
  handlers: {
    // Define additional Cloudflare Workers handlers here
    async queue(
      batch: MessageBatch,
      _env: Env,
      _ctx: ExecutionContext,
    ): Promise<void> {
      for (const message of batch.messages) {
        console.log('Received', message);
      }
    },
  } satisfies ExportedHandler<Env>,
};
