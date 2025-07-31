'use client';

const data = {
  'import.meta.env.WAKU_PUBLIC_TEST': import.meta.env.WAKU_PUBLIC_TEST || '-',
  'import.meta.env.WAKU_PRIVATE_TEST': import.meta.env.WAKU_PRIVATE_TEST || '-',
  'process.env.WAKU_PUBLIC_TEST': process.env.WAKU_PUBLIC_TEST || '-',
  // this is skipped since SSR can access process.env and cause hydration error
  // "process.env.WAKU_PRIVATE_TEST": process.env.WAKU_PRIVATE_TEST || '-',
};

export function TestEnvClient() {
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
