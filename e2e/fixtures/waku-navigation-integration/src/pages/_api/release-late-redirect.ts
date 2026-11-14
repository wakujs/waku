import { release } from '../../lib/late-redirect-gate.js';

export async function POST(req: Request) {
  release(new URL(req.url).searchParams.get('id') ?? '');
  return new Response('released');
}
