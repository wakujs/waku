import type { Unstable_SearchCodec } from 'waku/router';
import { z } from 'zod';

const schema = z.object({
  q: z.string().default(''),
  page: z.coerce.number().int().min(1).default(1),
});

export type ZodSearch = z.infer<typeof schema>;

export const zodSearchCodec = {
  id: 'zod',
  parse: (query: string): ZodSearch =>
    schema.parse(Object.fromEntries(new URLSearchParams(query))),
  serialize: (search: ZodSearch): string =>
    new URLSearchParams({ q: search.q, page: String(search.page) }).toString(),
} as const satisfies Unstable_SearchCodec<ZodSearch>;
