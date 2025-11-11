import { unstable_getRouterConfig } from 'waku/router/server';

export default function Debug() {
  const config = unstable_getRouterConfig();
  return (
    <div>
      <h4>Route inspection</h4>
      <pre>
        {JSON.stringify(
          config,
          null,
          2,
        )}
      </pre>
    </div>
  );
}
