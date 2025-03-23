import { compileMDX } from 'next-mdx-remote/rsc';
import { readdirSync, readFileSync } from 'node:fs';

export const getFileName = async (folder: string, slug: string) => {
  const blogFileNames: Array<string> = [];
  const blogSlugToFileName: Record<string, string> = {};

  readdirSync(folder).forEach((fileName) => {
    if (fileName.endsWith('.mdx')) {
      blogFileNames.push(fileName);
    }
  });

  for await (const fileName of blogFileNames) {
    const path = `${folder}/${fileName}`;
    const source = readFileSync(path, 'utf8');
    const mdx = await compileMDX({
      source,
      options: { parseFrontmatter: true },
    });
    const frontmatter = mdx.frontmatter as { slug: string };
    blogSlugToFileName[frontmatter.slug] = fileName;
  }

  const fileName = blogSlugToFileName[slug];

  return fileName;
};

export const getPostPaths = async (folder: string) => {
  const blogPaths: Array<string> = [];
  const blogFileNames: Array<string> = [];

  readdirSync(folder).forEach((fileName) => {
    if (fileName.endsWith('.mdx')) {
      blogFileNames.push(fileName);
    }
  });

  for await (const fileName of blogFileNames) {
    const path = `${folder}/${fileName}`;
    const source = readFileSync(path, 'utf8');
    const mdx = await compileMDX({
      source,
      options: { parseFrontmatter: true },
    });
    const frontmatter = mdx.frontmatter as { slug: string };
    blogPaths.push(frontmatter.slug);
  }

  return blogPaths;
};
