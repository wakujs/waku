import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolves paths both for source (during development) and dist (during build).
 * In dist/, we'll be in dist/server/assets/paths-*.js, so we need to go up to reach the website root.
 */
const getWebsiteRoot = () => {
  // During development: src/lib/paths.ts -> ../.. gets to website root
  // During production build: dist/server/assets/paths-*.js -> ../../.. gets to website root
  // Check if we're in dist directory
  if (__dirname.includes('/dist/server')) {
    return resolve(__dirname, '../../..');
  }
  return resolve(__dirname, '../..');
};

const getDocsRoot = () => {
  const websiteRoot = getWebsiteRoot();
  // docs is at ../../docs from website root
  return resolve(websiteRoot, '../../docs');
};

/**
 * Get absolute path to README.md (symlinked in private/)
 */
export const getReadmePath = () => {
  return join(getWebsiteRoot(), 'private/README.md');
};

/**
 * Get absolute path to blog contents directory
 */
export const getBlogContentsPath = () => {
  return join(getWebsiteRoot(), 'private/contents');
};

/**
 * Get absolute path to docs/guides directory
 */
export const getGuidesPath = () => {
  return join(getDocsRoot(), 'guides');
};

/**
 * Get absolute path to docs/create-pages.mdx
 */
export const getCreatePagesPath = () => {
  return join(getDocsRoot(), 'create-pages.mdx');
};
