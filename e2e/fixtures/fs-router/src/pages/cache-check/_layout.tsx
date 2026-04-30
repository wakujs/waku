import type { ReactNode } from 'react';

const CacheCheckLayout = ({ children }: { children: ReactNode }) => {
  // Render Date.now() so an e2e test can detect whether the (static)
  // layout was rendered at build time or live at runtime by comparing
  // against a timestamp captured before the request.
  // eslint-disable-next-line react-hooks/purity
  const time = Date.now();
  return (
    <div>
      <span data-testid="cache-check-time">{time}</span>
      {children}
    </div>
  );
};

export default CacheCheckLayout;
