'use client';

import { Link, SearchCodecsProvider_UNSTABLE } from 'waku/router/client';
import { searchCodec } from '../lib/search.js';

export function SearchPage() {
  return (
    <SearchCodecsProvider_UNSTABLE searchCodecs={[searchCodec]}>
      <Link to={{ to: '/foo', search: { q: 'after' } }}>Search foo</Link>
    </SearchCodecsProvider_UNSTABLE>
  );
}
