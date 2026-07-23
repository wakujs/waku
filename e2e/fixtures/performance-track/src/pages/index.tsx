import { PerfProbe } from '../components/perf-probe';

export default function HomePage() {
  return (
    <main>
      <h1>Home</h1>
      <PerfProbe pathname="/" />
    </main>
  );
}
