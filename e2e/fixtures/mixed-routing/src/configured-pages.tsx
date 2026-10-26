export function ConfiguredPage() {
  return (
    <section data-route-source="config">
      <title>Configured static page</title>
      <h1>Configured static page</h1>
      <p>This route comes from createPage.</p>
    </section>
  );
}

export function GreetingPage({ name }: { name: string }) {
  return (
    <section data-route-source="config">
      <title>Configured dynamic page</title>
      <h1>Configured dynamic page</h1>
      <p>
        Hello, <span data-testid="name">{name}</span>!
      </p>
    </section>
  );
}
