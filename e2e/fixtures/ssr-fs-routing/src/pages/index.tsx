import { Link } from 'waku';

export default async function HomePage() {
  return (
    <div>
      <h1>Home Page</h1>
      <Link to="/nested">Nested page</Link>
      <Link to="/found">Found page</Link>
      <Link to="/not-found">Not found page (404)</Link>
      <Link to="/dynamic/missing">Missing page (404)</Link>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
