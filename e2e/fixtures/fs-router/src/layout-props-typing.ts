import type { LayoutProps } from 'waku/router';

// Type-level assertions only; never called. CreatePagesConfig.layouts is
// augmented by the generated pages.gen.ts, so a known layout path (including a
// layout-only path with no co-located page, e.g. /cache-check or the dynamic
// /dynamic-layout/[id]) resolves while an unknown path, or a page path that has
// no layout, is rejected.
export function assertLayoutPropsTyping(
  rootProps: LayoutProps<'/'>,
  layoutOnlyProps: LayoutProps<'/cache-check'>,
  dynamicProps: LayoutProps<'/dynamic-layout/[id]'>,
  sharedProps: LayoutProps<'/shared-layout/[lang]'>,
  staticPathsProps: LayoutProps<'/i18n/[lang]'>,
) {
  void rootProps.children;
  void layoutOnlyProps.children;
  void dynamicProps.children;
  // a dynamic layout path derives its own param via RouteParams
  const id: string = dynamicProps.id;
  void id;
  // @ts-expect-error a child page param ([sub]) does not leak into the layout
  void dynamicProps.sub;
  const sharedLang: string | undefined = sharedProps.lang;
  void sharedLang;
  // @ts-expect-error a static layout shared by dynamic pages lacks its param
  const sharedLangString: string = sharedProps.lang;
  void sharedLangString;
  const staticPathsLang: string = staticPathsProps.lang;
  void staticPathsLang;
}

// @ts-expect-error an unknown layout path is not a known layout
export type InvalidLayoutProps = LayoutProps<'/no-such-layout'>;
// @ts-expect-error a page path with no co-located layout is not a layout path
export type PageOnlyLayoutProps = LayoutProps<'/nested/[name]'>;
