import { compileMDX as compileBaseMDX } from 'next-mdx-remote/rsc';
import type { CompileMDXResult, MDXRemoteProps } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';

export const compileMDX = async <TFrontmatter = Record<string, unknown>>({
  source,
  options,
  components,
}: MDXRemoteProps): Promise<CompileMDXResult<TFrontmatter>> => {
  const remarkPlugins = options?.mdxOptions?.remarkPlugins ?? [];

  return compileBaseMDX<TFrontmatter>({
    source,
    components,
    options: {
      ...options,
      mdxOptions: {
        ...options?.mdxOptions,
        remarkPlugins: [...remarkPlugins, remarkGfm],
      },
    },
  });
};
