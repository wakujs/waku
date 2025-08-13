import type { PageProps } from 'waku/router';

const Page = ({ name }: PageProps<'/nested/[name]'>) => (
  <div>
    <h2>Nested / {name}</h2>
  </div>
);

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};

export default Page;
