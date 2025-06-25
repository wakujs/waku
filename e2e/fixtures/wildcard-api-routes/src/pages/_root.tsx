export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <title>Wildcard API Routes</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
