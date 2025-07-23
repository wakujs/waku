export function TestEnvServer() {
  const data = {
    WAKU_PUBLIC_TEST_META: import.meta.env.WAKU_PUBLIC_TEST || '-',
    WAKU_PRIVATE_TEST_META: import.meta.env.WAKU_PRIVATE_TEST || '-',
    WAKU_PUBLIC_TEST_PROCESS: process.env.WAKU_PUBLIC_TEST || '-',
    WAKU_PRIVATE_TEST_PROCESS: process.env.WAKU_PRIVATE_TEST || '-',
  };
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
