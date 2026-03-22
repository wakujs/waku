import { TestClient } from '../components/client';

export default async function HomePage() {
  return (
    <div>
      <TestServer />
      <TestClient />
    </div>
  );
}

function TestServer() {
  return (
    <div className="text-red-500 underline decoration-dashed">test-server</div>
  );
}
