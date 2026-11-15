import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import { requestRedirect } from 'waku/router/server';
import { SearchProbe } from '../components/search-probe.js';
import { querySearchCodec } from '../lib/search.js';

export default function SearchPage({ query = '' }: { query?: string }) {
  if (new URLSearchParams(query).get('q') === 'from-follow') {
    requestRedirect('/search?q=spent');
    cancelRender();
  }
  return (
    <div>
      <h1 data-testid="search-heading">Search</h1>
      <SearchProbe />
      <div data-testid="search-spacer" style={{ height: '200vh' }} />
    </div>
  );
}

export const getConfig = () =>
  ({
    render: 'dynamic',
    unstable_searchCodec: querySearchCodec,
  }) as const;
