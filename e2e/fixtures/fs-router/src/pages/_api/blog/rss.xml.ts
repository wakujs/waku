export async function GET() {
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Blog RSS</title></channel></rss>',
    {
      headers: {
        'Content-Type': 'application/xml',
      },
    },
  );
}
