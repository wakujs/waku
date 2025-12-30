import { fsRouter } from 'waku';
import adapter from 'waku/adapters/cloudflare';

const adapterExports = adapter(
  fsRouter(import.meta.glob('./**/*.tsx', { base: './pages' })),
);

export default {
  // The fetch handler is included in adapterExports
  ...adapterExports,
  handlers: {
    // Define additional Cloudflare Workers handlers here
    // https://developers.cloudflare.com/workers/runtime-apis/handlers/
    // async queue(
    //   batch: MessageBatch,
    //   _env: Env,
    //   _ctx: ExecutionContext,
    // ): Promise<void> {
    //   for (const message of batch.messages) {
    //     console.log('Received', message);
    //   }
    // },
  } satisfies ExportedHandler<Env>,
};
