import { getMetadataBaseUrl } from '../../components/meta';
import { PostPage } from '../../components/post-page';
import { readPostPaths } from '../../lib/find-file-name';

type BlogArticlePageProps = {
  slug: string;
};

export default async function BlogArticlePage({ slug }: BlogArticlePageProps) {
  return (
    <PostPage
      slug={slug}
      folder="./private/contents"
      ogImageUrl={`${getMetadataBaseUrl()}/og-image/blog/${slug}.png`}
    />
  );
}

export const getConfig = async () => {
  const blogPaths = await readPostPaths('./private/contents');

  return {
    render: 'static',
    staticPaths: blogPaths,
  } as const;
};
