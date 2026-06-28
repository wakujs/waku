import type { PageProps } from 'waku/router';

// Type-level assertions only; never called. CreatePagesConfig.pages is augmented
// by the generated pages.gen.ts, so a known route literal resolves to typed
// props while an unknown one is rejected at the type parameter.
export function assertPagePropsTyping(
  staticProps: PageProps<'/bar'>,
  dynamicProps: PageProps<'/nested/[name]'>,
) {
  void staticProps.path;
  void dynamicProps.name;
}

// @ts-expect-error an unknown route literal is not a known page path
export type InvalidPageProps = PageProps<'/no-such-route'>;
// @ts-expect-error a wrong slug name does not match the known dynamic route
export type WrongSlugPageProps = PageProps<'/nested/[wrong]'>;
