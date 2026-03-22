import { Link } from 'waku';
import { getStore } from 'waku-jotai/router';
import { Counter, countAtom } from '../components/counter';

export default async function HomePage() {
  const store = await getStore();
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1 className="text-4xl font-bold tracking-tight">{data.headline}</h1>
      <p>{data.body}</p>
      <Counter />
      <p className="mt-4">Jotai Count: {store.get(countAtom)}</p>
      <Link to="/about" className="mt-4 inline-block underline">
        About page
      </Link>
    </div>
  );
}

const getData = async () => {
  const data = {
    title: 'Waku',
    headline: 'Waku',
    body: 'Hello world!',
  };

  return data;
};

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
