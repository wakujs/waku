import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';
import { describe, expect, it } from 'vitest';
import type { PageProps } from '../src/router/base-types.js';
import type {
  PageExactPath,
  PropsForPages,
} from '../src/router/create-pages-utils/inferred-path-types.js';

// In this suite CreatePagesConfig is not augmented, so PagePath resolves to
// never and PageProps falls back to accepting any string (the pre-codegen
// bootstrap behavior). Rejection of unknown routes after codegen is proven in
// the augmented fs-router fixture (page-props-typing.ts).
describe('PageProps route constraint', () => {
  it('accepts any string before codegen and types its props', () => {
    type Props = PageProps<'/made/up/[foo]'>;
    expectType<TypeEqual<Props['foo'], string>>(true);
    expectType<TypeEqual<Props['path'], `/made/up/${string}`>>(true);
    expectType<TypeEqual<Props['query'], string>>(true);
    const props: Props = { path: '/made/up/x', query: '', foo: 'x' };
    expect(props.foo).toBe('x');
  });
});

describe('PageExactPath', () => {
  type Config = {
    pages:
      | { path: '/exact/[slug]'; render: 'static'; exactPath: true }
      | { path: '/maybe/[slug]'; render: 'dynamic'; exactPath: boolean }
      | { path: '/blog/[slug]'; render: 'dynamic' };
  };
  type Props<Path extends string> = PropsForPages<
    Path,
    PageExactPath<Config, Path>
  >;
  it('drops params from a page that is or may be exact', () => {
    type HasSlug<Path extends string> = 'slug' extends keyof Props<Path>
      ? true
      : false;
    expectType<TypeEqual<HasSlug<'/exact/[slug]'>, false>>(true);
    expectType<TypeEqual<HasSlug<'/maybe/[slug]'>, false>>(true);
    expectType<TypeEqual<HasSlug<'/exact/[slug]' | '/blog/[slug]'>, false>>(
      true,
    );
    expectType<TypeEqual<Props<'/blog/[slug]'>['slug'], string>>(true);
  });
  it('treats a path with no page as not exact', () => {
    expectType<TypeEqual<PageExactPath<{ pages: never }, '/a'>, false>>(true);
  });
});
