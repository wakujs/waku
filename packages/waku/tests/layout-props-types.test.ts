import type { ReactNode } from 'react';
import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';
import { describe, expect, it } from 'vitest';
import type { LayoutProps } from '../src/router/base-types.js';

// In this suite CreatePagesConfig is not augmented, so LayoutProps accepts any
// string path. Layouts use a loose constraint on purpose: a layout path may
// have no co-located page, so it is not necessarily in the page route union
// (e.g. a layout at /foo/[aaa] whose only page is /foo/[aaa]/[bbb]).
describe('LayoutProps', () => {
  it('adds children, derives its own params, and drops path/query', () => {
    type Props = LayoutProps<'/foo/[aaa]'>;
    expectType<TypeEqual<Props['children'], ReactNode>>(true);
    expectType<TypeEqual<Props['aaa'], string>>(true);
    expectType<TypeEqual<'path' extends keyof Props ? true : false, false>>(
      true,
    );
    expectType<TypeEqual<'query' extends keyof Props ? true : false, false>>(
      true,
    );
    const props: Props = { children: null, aaa: 'x' };
    expect(props.aaa).toBe('x');
  });
});
