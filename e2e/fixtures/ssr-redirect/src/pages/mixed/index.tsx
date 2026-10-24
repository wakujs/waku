export default function Page() {
  return <p>Dynamic page sharing the layout</p>;
}

export const getConfig = async () => ({ render: 'dynamic' }) as const;
