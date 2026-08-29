import { SearchProbe } from '../components/search-probe.js';
import { spikeSearchCodec } from '../lib/search.js';

export default function SearchPage() {
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
    unstable_searchCodec: spikeSearchCodec,
  }) as const;
