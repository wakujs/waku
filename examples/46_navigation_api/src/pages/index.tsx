import { Link } from '../lib/my-router/MyRouter.tsx';
import { Counter } from '../components/counter';

export default async function HomePage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1 className="text-4xl font-bold tracking-tight">{data.headline}</h1>
      <p>{data.body}</p>
      <Counter />
      <div className="flex gap-2">
        <Link to="/about" className="mt-4 inline-block underline">
          About page
        </Link>
        <Link to="/long" className="mt-4 inline-block underline">
          Long page
        </Link>
        <Link to="/long#seventy-five" className="mt-4 inline-block underline">
          Long page 75%
        </Link>
      </div>
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
    render: 'static',
  } as const;
};
