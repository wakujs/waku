export default function HomePage() {
  return <div data-testid="page-marker">PAGE_MARKER</div>;
}

// Dynamic so the build prunes static-only chunks and the root/layout
// must be served from cached metadata at request time.
export const getConfig = async () => ({ render: 'dynamic' }) as const;
