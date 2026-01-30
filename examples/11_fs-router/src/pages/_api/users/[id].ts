import type { TypedRequest } from 'waku/router';

export async function GET(req: TypedRequest<'/users/[id]'>) {
  const { id } = req.params;
  return Response.json({ id, message: `Hello user ${id}` });
}
