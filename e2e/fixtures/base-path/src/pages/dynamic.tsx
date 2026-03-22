export default function DyanmicPage() {
  return (
    <div>
      <h4>Dynamic page</h4>
      <div>renderd at {new Date().toISOString()}</div>
      <div>argv: {JSON.stringify(process.argv.slice(2))}</div>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
