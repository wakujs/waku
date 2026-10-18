import type { ReactNode } from 'react';
import { unstable_redirect as redirect } from 'waku/router/server';

export default function StaticActionLayout({
  children,
}: {
  children: ReactNode;
}) {
  const destination = '/runtime-build-dynamic';
  return (
    <>
      <form
        action={async () => {
          'use server';
          redirect(destination);
        }}
      >
        <button type="submit">Run static action</button>
      </form>
      {children}
    </>
  );
}

export const getConfig = async () => ({
  render: 'static' as const,
});
