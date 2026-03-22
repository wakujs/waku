import { readFileSync, readdirSync } from 'node:fs';
import { compileMDX } from 'next-mdx-remote/rsc';
import { GuideList } from '../../components/guide-list';
import { Meta } from '../../components/meta';
import { Page } from '../../components/page';
import { PostListContainer } from '../../components/post-list';
import type { BlogFrontmatter } from '../../types';

export default async function GuidesIndexPage() {
  const guides = await getGuides();

  return (
    <Page>
      <Meta
        title="Waku guides"
        description="The guides for working with Waku."
      />
      <PostListContainer>
        <GuideList guides={guides} />
      </PostListContainer>
    </Page>
  );
}

const getGuides = async () => {
  const guideFileNames: Array<string> = [];
  const guides: Array<{
    slug: string;
    title: string;
    description: string;
  }> = [];

  readdirSync('../../docs/guides/').forEach((fileName) => {
    if (fileName.endsWith('.mdx')) {
      guideFileNames.push(fileName);
    }
  });

  for await (const fileName of guideFileNames) {
    const path = `../../docs/guides/${fileName}`;
    const source = readFileSync(path, 'utf8');
    const mdx = await compileMDX({
      source,
      options: { parseFrontmatter: true },
    });
    const frontmatter = mdx.frontmatter as BlogFrontmatter;

    guides.push({
      slug: frontmatter.slug,
      title: frontmatter.title,
      description: frontmatter.description,
    });
  }

  return guides.sort((a, b) => a.slug.localeCompare(b.slug));
};

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
