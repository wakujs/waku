export async function getConfig() {
  return {
    render: 'dynamic' as const,
  };
}

export async function GET(_request: Request): Promise<Response> {
  // Confirm JSX is working. We don't have any library to take advantage of it like an OpenGraph or Email renderer.
  const _workingJsx = <p>Hello World</p>;

  return new Response('tsx API route');
}
