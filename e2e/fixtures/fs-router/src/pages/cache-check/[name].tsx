import type { PageProps } from 'waku/router';

const Page = ({ name }: PageProps<'/cache-check/[name]'>) => (
  <h2>cache-check / {name}</h2>
);

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};

export default Page;
