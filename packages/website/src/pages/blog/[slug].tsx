import { PostPage } from '../../components/post-page';
import { getBlogContentsPath } from '../../lib/paths';
import { getPostPaths } from '../../lib/get-file-name';

type BlogArticlePageProps = {
  slug: string;
};

export default async function BlogArticlePage({ slug }: BlogArticlePageProps) {
  return <PostPage slug={slug} folder={getBlogContentsPath()} />;
}

export const getConfig = async () => {
  const blogPaths = await getPostPaths(getBlogContentsPath());

  return {
    render: 'static',
    staticPaths: blogPaths,
  } as const;
};
