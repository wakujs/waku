export default function AboutPage() {
  return (
    <section data-route-source="file">
      <title>File-based about</title>
      <h1>File-based about</h1>
      <p>File-based and configured routes share the same layout.</p>
    </section>
  );
}

export const getConfig = async () => ({ render: 'static' as const });
