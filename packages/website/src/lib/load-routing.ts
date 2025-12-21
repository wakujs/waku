import { readFileSync } from 'node:fs';
import { getCreatePagesPath, getReadmePath } from './paths';

/**
 * Extracts file-based routing documentation from README.md
 * Returns content from "### Overview" through the end of the Routing section
 */
export const loadRoutingFileBased = (): string => {
  const readme = readFileSync(getReadmePath(), 'utf8');
  const routingSectionMatch = readme.match(
    /^## Routing\n([\s\S]*?)(?=^## [A-Z])/m,
  );
  const routingSection = routingSectionMatch?.[1];
  if (!routingSection) {
    throw new Error('Failed to extract Routing section from README.md.');
  }
  const overviewMatch = routingSection.match(/^### Overview\n+([\s\S]*)/m);
  const contentAfterOverview = overviewMatch?.[1];
  if (!contentAfterOverview) {
    throw new Error('Failed to find "### Overview" in Routing section.');
  }
  return contentAfterOverview.trim();
};

/**
 * Extracts config-based routing documentation from create-pages.mdx
 * Removes frontmatter and adjusts the main heading
 */
export const loadRoutingConfigBased = (): string => {
  const createPages = readFileSync(getCreatePagesPath(), 'utf8');
  const withoutFrontmatter = createPages.replace(/^---[\s\S]*?---\n*/, '');
  const withoutMainHeading = withoutFrontmatter.replace(
    /^## Routing \(low-level API\)\n*/m,
    '',
  );
  return withoutMainHeading.trim();
};

/**
 * Extracts everything before the Routing section from README.md
 * Used to render Introduction, Getting started, and Rendering sections
 */
export const loadBeforeRouting = (): string => {
  const readme = readFileSync(getReadmePath(), 'utf8');
  const match = readme.match(/(^## Introduction[\s\S]*?)(?=^## Routing)/m);
  const content = match?.[1];
  if (!content) {
    throw new Error('Failed to extract content before Routing section.');
  }
  return content.trim();
};

/**
 * Extracts everything after the Routing section from README.md
 * Used to render Navigation and all subsequent sections
 */
export const loadAfterRouting = (): string => {
  const readme = readFileSync(getReadmePath(), 'utf8');
  const match = readme.match(
    /^## Routing[\s\S]*?(^## (?!Routing)[A-Z][\s\S]*)/m,
  );
  const content = match?.[1];
  if (!content) {
    throw new Error('Failed to extract content after Routing section.');
  }
  return content.trim();
};
