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
    // concurrency of 500 creates 4 batches and each batch takes 1 second,
    // so ssg takes at least 4 seconds in total.
    staticPaths: new Array(2000).fill(null).map((_, i) => `path-${i}`),
  };
}
