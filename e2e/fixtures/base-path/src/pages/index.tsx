import { Counter } from '../components/counter';

export default async function HomePage() {
  return (
    <div>
      <h4>Home page</h4>
      <Counter />
      <div>Rendered at {new Date().toISOString()}</div>
    </div>
  );
}
