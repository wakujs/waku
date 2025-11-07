import { Link } from 'waku';
import { ErrorBoundary } from "react-error-boundary"

export default async function AboutPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1 className="text-4xl font-bold tracking-tight">{data.headline}</h1>
      <p>{data.body}</p>
      <Link to="/" className="mt-4 inline-block underline">
        Return home
      </Link>
      <ErrorBoundary fallback={<h1>Something went wrong.</h1>}>
        <ThrowComponent />
      </ErrorBoundary>
    </div>
  );
}

function ThrowComponent() {
  throw new Error("An error occurred in ThrowComponent");
  return <div>unreachable</div>
}

const getData = async () => {
  const data = {
    title: 'About',
    headline: 'About Waku',
    body: 'The minimal React framework',
  };

  return data;
};

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
