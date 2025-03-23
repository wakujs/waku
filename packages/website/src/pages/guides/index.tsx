import { readdirSync, readFileSync } from 'node:fs';
import { compileMDX } from 'next-mdx-remote/rsc';

import { Page } from '../../components/page';
import { Meta } from '../../components/meta';
import type { BlogFrontmatter } from '../../types';
import { PostList, PostListContainer } from '../../components/post-list';

export default async function BlogIndexPage() {
  const articles = await getArticles();

  return (
    <Page>
      <Meta
        title="Waku guide"
        description="The guides for working with Waku."
      />
      <PostListContainer>
        <p className="bg-gray-950/90 mb-16 rounded-xl border border-gray-800 p-4 text-white sm:p-6 lg:p-12">
          Our guides walk through hosting instructions, framework behavior,
          developer tooling, and more! We will talk through unstable APIs here,
          so you can help experiment with our new and fun features.
        </p>
        <PostList posts={articles} path="guides" />
      </PostListContainer>
    </Page>
  );
}

const getArticles = async () => {
  const blogFileNames: Array<string> = [];
  const blogArticles: Array<{
    slug: string;
    title: string;
    description: string;
  }> = [];

  readdirSync('../../docs/guides/').forEach((fileName) => {
    if (fileName.endsWith('.mdx')) {
      blogFileNames.push(fileName);
    }
  });

  for await (const fileName of blogFileNames) {
    const path = `../../docs/guides/${fileName}`;
    const source = readFileSync(path, 'utf8');
    const mdx = await compileMDX({
      source,
      options: { parseFrontmatter: true },
    });
    const frontmatter = mdx.frontmatter as BlogFrontmatter;

    const article = {
      slug: frontmatter.slug,
      title: frontmatter.title,
      description: frontmatter.description,
    };

    blogArticles.push(article);
  }

  return blogArticles.sort((a, b) => a.slug.localeCompare(b.slug));
};

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
