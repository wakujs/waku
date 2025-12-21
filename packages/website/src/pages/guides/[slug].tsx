import { PostPage } from '../../components/post-page';
import { getGuidesPath } from '../../lib/paths';
import { getPostPaths } from '../../lib/get-file-name';

type BlogArticlePageProps = {
  slug: string;
};

export default async function BlogArticlePage({ slug }: BlogArticlePageProps) {
  return <PostPage slug={slug} folder={getGuidesPath()} />;
}

export const getConfig = async () => {
  const blogPaths = await getPostPaths(getGuidesPath());

  return {
    render: 'static',
    staticPaths: blogPaths,
  } as const;
};
