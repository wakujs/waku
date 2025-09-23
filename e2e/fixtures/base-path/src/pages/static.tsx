export default async function AboutPage() {
  return (
    <div>
      <h4>Static page</h4>
      <div>Renderd at {new Date().toISOString()}</div>
      <div>Argv: {JSON.stringify(process.argv.slice(2))}</div>
    </div>
  );
}
