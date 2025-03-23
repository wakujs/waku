import { readdirSync, readFileSync } from 'node:fs';
import { compileMDX } from 'next-mdx-remote/rsc';

import { Page } from '../../components/page';
import { Meta } from '../../components/meta';
import { getAuthor } from '../../lib/get-author';
import type { BlogFrontmatter } from '../../types';
import { PostList, PostListContainer } from '../../components/post-list';

export default async function BlogIndexPage() {
  const articles = await getArticles();

  return (
    <Page>
      <Meta title="Waku blog" description="The official Waku developer blog." />
      <PostListContainer>
        <PostList posts={articles} path="blog" />
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
    author: { name: string };
    date: string;
    rawDate: string;
    release: string | undefined;
  }> = [];

  readdirSync('./private/contents').forEach((fileName) => {
    if (fileName.endsWith('.mdx')) {
      blogFileNames.push(fileName);
    }
  });

  for await (const fileName of blogFileNames) {
    const path = `./private/contents/${fileName}`;
    const source = readFileSync(path, 'utf8');
    const mdx = await compileMDX({
      source,
      options: { parseFrontmatter: true },
    });
    const frontmatter = mdx.frontmatter as BlogFrontmatter;

    const author = getAuthor(frontmatter.author);
    const date = new Date(frontmatter.date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const article = {
      slug: frontmatter.slug,
      title: frontmatter.title,
      description: frontmatter.description,
      author,
      release: frontmatter.release,
      date,
      rawDate: frontmatter.date,
    };

    blogArticles.push(article);
  }

  return blogArticles.sort((a, b) => (a.rawDate > b.rawDate ? -1 : 1));
};

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
