export default async function FoundPage() {
  return (
    <div>
      <h1>Found Page</h1>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
