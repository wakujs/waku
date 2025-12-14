export default async function NestedPage() {
  return (
    <div>
      <h1>Nested Page</h1>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
