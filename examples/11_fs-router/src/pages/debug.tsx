import { Suspense } from 'react';
import { getRouterConfigs } from '../waku.server.js';

const SlowServerInfo = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 500));
  return <p>Server delay complete at {new Date().toLocaleTimeString()}</p>;
};

export default async function Debug() {
  const configs = await getRouterConfigs();
  return (
    <div>
      <h4>Route inspection</h4>
      <Suspense fallback={<p>Loading server info...</p>}>
        <SlowServerInfo />
      </Suspense>
      <pre>{JSON.stringify(configs, null, 2)}</pre>
    </div>
  );
}
