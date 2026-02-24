import type { PageProps } from 'waku/router';

const Page = ({ name }: PageProps<'/nested/[name]'>) => (
  <div>
    <h2>Nested / {name}</h2>
  </div>
);

export const getConfig = () => {
  return {
    render: 'static',
    staticPaths: ['encoded%20path', 'encoded%E6%B8%AC%E8%A9%A6path'],
  } as const;
};

export default Page;
