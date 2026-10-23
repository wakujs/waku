import { Link } from 'waku';

export default async function HomePage() {
  return (
    <div>
      <h1>Home Page</h1>
      <Link to="/sync">Sync Page</Link>
      <Link to="/async">Async Page</Link>
      <Link to="/external-page">External Page</Link>
      <Link to="/external-late">External Late Page</Link>
      <Link to="/intent">Intent Redirect</Link>
      <Link to="/intent-late">Intent Late Redirect</Link>
      <Link to="/intent-missing">Intent Missing</Link>
      <Link to="/intent-static">Intent Static Redirect</Link>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
