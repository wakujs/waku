import { readCreatePages, readReadme } from './load-docs';

export const readRoutingFileBased = (): string => {
  const readme = readReadme();
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

export const readRoutingConfigBased = (): string => {
  const createPages = readCreatePages();
  const withoutFrontmatter = createPages.replace(/^---[\s\S]*?---\n*/, '');
  const withoutMainHeading = withoutFrontmatter.replace(
    /^## Routing \(low-level API\)\n*/m,
    '',
  );
  return withoutMainHeading.trim();
};

export const readBeforeRouting = (): string => {
  const readme = readReadme();
  const match = readme.match(/(^## Introduction[\s\S]*?)(?=^## Routing)/m);
  const content = match?.[1];
  if (!content) {
    throw new Error('Failed to extract content before Routing section.');
  }
  return content.trim();
};

export const readAfterRouting = (): string => {
  const readme = readReadme();
  const match = readme.match(
    /^## Routing[\s\S]*?(^## (?!Routing)[A-Z][\s\S]*)/m,
  );
  const content = match?.[1];
  if (!content) {
    throw new Error('Failed to extract content after Routing section.');
  }
  return content.trim();
};
