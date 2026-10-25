export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Nonce Test</title>
      </head>
      <body>
        <main>
          <h1 data-testid="title">Nonce Test</h1>
          <p data-testid="message">Hello from SSR with nonce!</p>
        </main>
      </body>
    </html>
  );
}
