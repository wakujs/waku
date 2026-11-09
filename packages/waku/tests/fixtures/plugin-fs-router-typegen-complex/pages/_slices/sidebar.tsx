export default function Sidebar() {
  return <aside>Sidebar</aside>;
}

export const getConfig = async () => ({ render: 'static' }) as const;
