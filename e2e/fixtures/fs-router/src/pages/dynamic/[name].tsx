export default async function DynamicOnePage({ name }: { name: string }) {
  await simulateLoadTime(100);

  return (
    <h2>
      Dynamic ${name} Page Time {new Date().toISOString()}
    </h2>
  );
}

function simulateLoadTime(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const getConfig = () => ({
  render: 'dynamic',
});
