import { Link } from 'waku';

export default async function Book({ name }: { name: string }) {
  await new Promise((resolve) => setTimeout(resolve, 500));

  return (
    <>
      <nav style={{ padding: 8 }}>
        <Link to="/">🏠 Home</Link> &gt; {name}
      </nav>

      <hr />

      <div style={{ padding: 8 }}>{name}</div>
    </>
  );
}
