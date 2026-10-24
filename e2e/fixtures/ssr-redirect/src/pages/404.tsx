export default function Missing() {
  return <h1>Custom Not Found</h1>;
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
