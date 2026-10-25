import { PostPage } from '../../components/post-page';
import { readPostPaths } from '../../lib/find-file-name';

type BlogArticlePageProps = {
  slug: string;
};

export default async function BlogArticlePage({ slug }: BlogArticlePageProps) {
  return <PostPage slug={slug} folder="../../docs/guides" />;
}

export const getConfig = async () => {
  const blogPaths = await readPostPaths('../../docs/guides');

  return {
    render: 'static',
    staticPaths: blogPaths,
  } as const;
};
