export default function HomePage() {
  return (
    <main>
      <h1 data-testid="title">Nonce Middleware Test</h1>
      <p data-testid="message">Hello from SSR with nonce via middleware!</p>
    </main>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
