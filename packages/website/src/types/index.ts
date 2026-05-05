export type BlogFrontmatter = {
  slug: string;
  title: string;
  description: string;
  author: string;
  release: string;
  date: string;
};

export type GuideTag = 'Experimental';

export type GuideFrontmatter = {
  slug: string;
  title: string;
  description: string;
  category?: string;
  order?: number;
  tags?: GuideTag[];
  hidden?: boolean;
};
