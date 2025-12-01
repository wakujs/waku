import { Counter } from '../components/counter';

export default async function HomePage() {
  return (
    <div>
      <h4>Home page</h4>
      <Counter />
      <div>renderd at {new Date().toISOString()}</div>
      <div>argv: {JSON.stringify(process.argv.slice(2))}</div>
    </div>
  );
}
