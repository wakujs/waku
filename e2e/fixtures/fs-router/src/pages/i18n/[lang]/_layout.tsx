import type { LayoutProps } from 'waku/router';

const LangLayout = ({ lang, children }: LayoutProps<'/i18n/[lang]'>) => {
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();
  return (
    <div>
      <span data-testid="i18n-lang">{lang}</span>
      <span data-testid="i18n-rendered-at">{renderedAt}</span>
      {children}
    </div>
  );
};

export const getConfig = () => {
  return {
    render: 'static',
    staticPaths: ['en', 'ja'],
  } as const;
};

export default LangLayout;
