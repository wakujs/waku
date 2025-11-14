import type { PageProps } from 'waku/router';
import { Path } from '../Path.js';

export default async function Test({ path }: PageProps<'/[slug]'>) {
  await new Promise((resolve) =>
    // eslint-disable-next-line react-hooks/purity
    setTimeout(resolve, 500 + 500 * Math.random()),
  );
  return <Path path={path} />;
}

export async function getConfig() {
  return {
    render: 'static',
    staticPaths: new Array(100).fill(null).map((_, i) => `path-${i}`),
  };
}
