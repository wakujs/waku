export function GET(request: Request) {
  const url = new URL(request.url);
  return Response.json({
    ok: true,
    request: {
      handler: 'GET',
      method: request.method,
      pathname: url.pathname,
    },
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  return Response.json({
    ok: true,
    request: {
      handler: 'POST',
      method: request.method,
      pathname: url.pathname,
      text: await request.text(),
    },
  });
}
