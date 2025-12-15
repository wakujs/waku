export default function Page() {
  return (
    <main>
      <h1 data-testid="custom-user-adapter-heading">
        Hello from custom user adapter
      </h1>
    </main>
  );
}

export const getConfig = async () => ({ render: 'static' as const });
