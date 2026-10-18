export default function StaticActionPage() {
  return <p>Static action</p>;
}

export const getConfig = async () => ({
  render: 'dynamic' as const,
});
