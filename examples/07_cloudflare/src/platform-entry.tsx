import { DurableObject } from 'cloudflare:workers' // eslint-disable-line import/no-unresolved

export class MyDurableObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    // Required, as we're extending the base class.
    super(ctx, env)
  }

  /* Define your Durable Object methods here */
}

export default {
  async queue(
    batch: MessageBatch,
    _env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    for (const message of batch.messages) {
      console.log('Received', message);
    }
  },
} satisfies ExportedHandler<Env>;
