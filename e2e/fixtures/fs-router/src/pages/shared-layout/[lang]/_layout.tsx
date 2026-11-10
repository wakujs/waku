import type { LayoutProps } from 'waku/router';

const SharedLayout = ({
  lang,
  children,
}: LayoutProps<'/shared-layout/[lang]'>) => {
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();
  return (
    <div>
      <span data-testid="shared-layout-lang">{lang ?? 'any'}</span>
      <span data-testid="shared-layout-rendered-at">{renderedAt}</span>
      {children}
    </div>
  );
};

export default SharedLayout;
