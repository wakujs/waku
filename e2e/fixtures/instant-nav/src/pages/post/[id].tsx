import type { PageProps } from 'waku/router';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function Post({ id }: PageProps<'/post/[id]'>) {
  await sleep(600);
  return <div data-testid="post-body">Post {id}</div>;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
