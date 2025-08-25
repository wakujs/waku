import { Counter } from '../components/counter';

export default async function HomePage() {
  return (
    <div>
      <h3>Waku + Cloudflare</h3>
      <Counter />
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
