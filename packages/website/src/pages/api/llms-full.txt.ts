import { readFileSync } from 'node:fs';

/**
 * Serves consolidated README.md as plain text for LLMs
 */
export const GET = async () => {
  let readme = readFileSync('./private/README.md', 'utf8').replace(
    /\r\n?/g,
    '\n',
  );
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
