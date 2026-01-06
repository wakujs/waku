export default function handler(req: Request) {
  return new Response('default: ' + req.method);
}

export function GET(_req: Request) {
  return new Response('GET');
}
