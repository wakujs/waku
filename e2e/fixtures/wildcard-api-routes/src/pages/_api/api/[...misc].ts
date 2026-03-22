export async function GET(__request: Request): Promise<Response> {
  return new Response('/api root catch-all');
}
