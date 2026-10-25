export default function HomePage() {
  return (
    <section data-route-source="file">
      <title>File-based home</title>
      <h1>File-based home</h1>
      <p>This route comes from a discovered page file.</p>
    </section>
  );
}

export const getConfig = async () => ({ render: 'static' as const });
