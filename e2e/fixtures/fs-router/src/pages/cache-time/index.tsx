import { Slice } from 'waku/router/client';

export default function CacheTimePage() {
  return (
    <Slice
      id="cache-time/foo"
      lazy
      fallback={<span data-testid="cache-time-loading">Loading...</span>}
    />
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
