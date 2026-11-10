import type { PageProps } from 'waku/router';

const Page = ({ lang, slug }: PageProps<'/i18n/[lang]/post/[slug]'>) => (
  <h2>
    {lang} / {slug}
  </h2>
);

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};

export default Page;
