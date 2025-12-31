import { Link } from '../lib/my-router/MyRouter';

export default async function HomePage() {
  return (
    <div className="h-[200vh]">
      <title>A long page</title>
      <div className="mt-[50vh] flex gap-2">
        <Link to="/" className="mt-4 inline-block underline">
          Index page
        </Link>
        <Link to="/about" className="mt-4 inline-block underline">
          About page
        </Link>
        <Link to="#seventy-five" className="mt-4 inline-block underline">
          Down to 75%
        </Link>
      </div>
      <div id="seventy-five" className="mt-[25vh] flex gap-2">
        75%vh
      </div>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
