import { unstable_getContext as getContext } from 'waku/server';
import { Echo } from './Echo.js';

export function ServerEcho({ echo }: { echo: string }) {
  // TODO is there a more reasonable way?
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return (
    <>
      <Echo echo={echo} timestamp={now} />
      <p data-testid="req-url">{getContext().req.url}</p>
    </>
  );
}
