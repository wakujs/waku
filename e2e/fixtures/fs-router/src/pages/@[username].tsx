import type { PageProps } from 'waku/router';

const Page = ({ username }: PageProps<'/@[username]'>) => (
  <div>
    <h2>Profile / {username}</h2>
  </div>
);

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};

export default Page;
