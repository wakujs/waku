import { Link } from 'waku';
import { ShowQuery } from '../components/ShowQuery';

export default function Exists() {
  return (
    <div>
      <h1>Existing page</h1>
      <ShowQuery />
      <p>
        <Link to="/">Back</Link>
      </p>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
