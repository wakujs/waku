import type { LayoutProps } from 'waku/router';

// Type-level assertions only; never called. CreatePagesConfig.layouts is
// augmented by the generated pages.gen.ts, so a known layout path (including a
// layout-only path with no co-located page, e.g. /cache-check) resolves while
// an unknown path, or a page path that has no layout, is rejected.
export function assertLayoutPropsTyping(
  rootProps: LayoutProps<'/'>,
  layoutOnlyProps: LayoutProps<'/cache-check'>,
) {
  void rootProps.children;
  void layoutOnlyProps.children;
}

// @ts-expect-error an unknown layout path is not a known layout
export type InvalidLayoutProps = LayoutProps<'/no-such-layout'>;
// @ts-expect-error a page path with no co-located layout is not a layout path
export type PageOnlyLayoutProps = LayoutProps<'/nested/[name]'>;
