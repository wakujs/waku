import type { ApiContext } from 'waku/router';

export async function GET(_req: Request, { params }: ApiContext<'/users/[id]'>) {
  const { id } = params;
  return Response.json({ id, message: `Hello user ${id}` });
}
