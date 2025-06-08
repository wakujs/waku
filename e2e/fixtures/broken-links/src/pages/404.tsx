import { Link } from 'waku';

import { ClientTitle } from '../components/ClientTitle.js';

export default function NotFound() {
  return (
    <div>
      <h1>Custom not found</h1>
      <ClientTitle>Custom Not Found Title</ClientTitle>
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
