import { Link } from 'waku';

export default function Root() {
  return (
    <ul>
      <li>
        <Link to="/build/static">Build static</Link>
      </li>
      <li>
        <Link to="/build/dynamic">Build dynamic</Link>
      </li>
    </ul>
  );
}
