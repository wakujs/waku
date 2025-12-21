import { loadReadme } from '../../lib/load-docs';

/**
 * Serves consolidated README.md as plain text for LLMs
 */
export const GET = async () => {
  let readme = loadReadme();
  readme = readme.replace(
    /⛩️ The minimal React framework\n\n[\s\S]*?\n\n## Introduction/,
    '⛩️ The minimal React framework\n\n## Introduction',
  );
  readme = readme.replace(/\n## Community[\s\S]*$/, '\n');
  return new Response(readme, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
