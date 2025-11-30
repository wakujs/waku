import { getRouterConfigs } from '../server-entry.js';

export default async function Debug() {
  const configs = await getRouterConfigs();
  return (
    <div>
      <h4>Route inspection</h4>
      <pre>{JSON.stringify(configs, null, 2)}</pre>
    </div>
  );
}
