import type { Plugin } from 'vite';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compileMDX } from 'next-mdx-remote/rsc';

interface LLMTextPluginOptions {
  hostname?: string;
  contentsPath?: string;
  outputPath?: string;
}

interface BlogPost {
  slug: string;
  title: string;
  description?: string;
  author?: string;
  date?: string;
  content: string;
}

export function llmTextPlugin(options: LLMTextPluginOptions = {}): Plugin {
  const {
    hostname = 'https://waku.gg',
    contentsPath = './private/contents',
    outputPath = './public/llm.txt',
  } = options;

  async function generateLLMText() {
    const posts: BlogPost[] = [];

    // Read all MDX files
    const dirents = await readdir(contentsPath);
    const files = dirents.filter((file) => file.endsWith('.mdx'));

    for (const fileName of files) {
      const filePath = join(contentsPath, fileName);
      const source = await readFile(filePath, 'utf8');

      const { frontmatter } = await compileMDX({
        source,
        options: { parseFrontmatter: true },
      });

      const fm = frontmatter as {
        slug: string;
        title: string;
        description?: string;
        author?: string;
        date?: string;
      };

      posts.push({
        slug: fm.slug,
        title: fm.title,
        ...(fm.description && { description: fm.description }),
        ...(fm.author && { author: fm.author }),
        ...(fm.date && { date: fm.date }),
        content: source.replace(/^---\n[\s\S]*?\n---\n/, '').trim(),
      });
    }

    // Sort posts by date (newest first)
    posts.sort((a, b) => {
      if (!a.date || !b.date) {
        return 0;
      }
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    // Generate llm.txt content
    let llmContent = `# Waku Documentation

`;
    llmContent += `This file contains all the blog posts and documentation from ${hostname}\n\n`;
    llmContent += `Generated on: ${new Date().toISOString()}\n\n`;
    llmContent += `---\n\n`;

    // Add table of contents
    llmContent += `## Table of Contents\n\n`;
    posts.forEach((post, index) => {
      llmContent += `${index + 1}. [${post.title}](${hostname}/blog/${post.slug})\n`;
    });
    llmContent += `\n---\n\n`;

    // Add full content for each post
    posts.forEach((post) => {
      llmContent += `## ${post.title}\n\n`;
      llmContent += `URL: ${hostname}/blog/${post.slug}\n`;
      if (post.author) {
        llmContent += `Author: ${post.author}\n`;
      }
      if (post.date) {
        llmContent += `Date: ${post.date}\n`;
      }
      if (post.description) {
        llmContent += `Description: ${post.description}\n`;
      }
      llmContent += `\n${post.content}\n\n`;
      llmContent += `---\n\n`;
    });

    // Write the file
    await writeFile(outputPath, llmContent, 'utf8');
    console.log(`✓ Generated llm.txt with ${posts.length} posts`);
  }

  return {
    name: 'vite-plugin-llmstxt',
    async buildStart() {
      await generateLLMText();
    },
    configureServer(server) {
      // Generate on dev server start
      generateLLMText().catch((error) => {
        console.error('Failed to generate llm.txt', error);
      });

      // Serve llm.txt in development
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/llm.txt') {
          try {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            const content = await readFile(outputPath, 'utf8');
            res.end(content);
            return;
          } catch (error) {
            console.error('Failed to read llm.txt', error);
            res.statusCode = 500;
            res.end('Failed to read llm.txt');
            return;
          }
        }
        next();
      });
    },
  };
}
