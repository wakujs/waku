import { PostPage } from '../../components/post-page';
import { getPostPaths } from '../../lib/get-file-name';

type BlogArticlePageProps = {
  slug: string;
};

export default async function BlogArticlePage({ slug }: BlogArticlePageProps) {
  return <PostPage slug={slug} folder="./private/contents" />;
}

export const getConfig = async () => {
  const blogPaths = await getPostPaths('./private/contents');

  return {
    render: 'static',
    staticPaths: blogPaths,
  } as const;
};
