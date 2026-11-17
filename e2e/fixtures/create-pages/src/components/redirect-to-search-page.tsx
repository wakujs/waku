import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import { requestRedirect } from 'waku/router/server';
import { searchRoute } from '../lib/routes';

export default function RedirectToSearchPage() {
  requestRedirect(searchRoute({ search: { q: 'hi', page: 2 } }));
  return cancelRender();
}
