export default function CacheTimeSlice({ id }: { id: string }) {
  // Render `Date.now()` at render-time so an e2e test can detect
  // whether this static slug slice was rendered at build time and
  // served from the cache, or rendered live at runtime.
  // eslint-disable-next-line react-hooks/purity
  const time = Date.now();
  return (
    <span data-testid={`cache-time-${id}`}>
      {id}:{time}
    </span>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
    staticPaths: ['foo'],
  } as const;
};
