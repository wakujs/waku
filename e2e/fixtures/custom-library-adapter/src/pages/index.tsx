export default function Page() {
  return (
    <main>
      <h1 data-testid="custom-adapter-heading">Hello from custom adapter</h1>
    </main>
  );
}

export const getConfig = async () => ({ render: 'static' as const });
