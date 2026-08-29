export default function NotFoundPage() {
  return <h1 data-testid="not-found">Custom 404</h1>;
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
