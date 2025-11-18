import type { PageProps } from 'waku/router';
import { Path } from '../Path.js';

export default async function Test({ path }: PageProps<'/[slug]'>) {
  await new Promise((resolve) =>
    // use random to make progress more realistic
    // eslint-disable-next-line react-hooks/purity
    setTimeout(resolve, 1000 + 100 * Math.random()),
  );
  return <Path path={path} />;
}

export async function getConfig() {
  return {
    render: 'static',
    staticPaths: new Array(5000).fill(null).map((_, i) => `path-${i}`),
  };
}
