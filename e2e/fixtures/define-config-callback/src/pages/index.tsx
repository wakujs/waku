export default async function HomePage() {
  return (
    <div>
      <h1>Define Config Callback Test</h1>
      <p data-testid="command">{import.meta.env.WAKU_TEST_COMMAND}</p>
      <p data-testid="mode">{import.meta.env.WAKU_TEST_MODE}</p>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
