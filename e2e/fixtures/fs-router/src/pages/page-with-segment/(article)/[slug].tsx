import type { PageProps } from 'waku/router';

// Create blog article pages
export default async function BlogArticlePage({
  slug,
}: PageProps<'/page-with-segment/[slug]'>) {
  return <h2>{slug}</h2>;
}

export const getConfig = async () => {
  return {
    render: 'static',
    staticPaths: ['introducing-waku'],
  } as const;
};
