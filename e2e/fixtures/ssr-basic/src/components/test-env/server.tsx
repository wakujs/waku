export function TestEnvServer() {
  const data = {
    "import.meta.env.WAKU_PUBLIC_TEST": import.meta.env.WAKU_PUBLIC_TEST || '-',
    "import.meta.env.WAKU_PRIVATE_TEST": import.meta.env.WAKU_PRIVATE_TEST || '-',
    "process.env.WAKU_PUBLIC_TEST": process.env.WAKU_PUBLIC_TEST || '-',
    "process.env.WAKU_PRIVATE_TEST": process.env.WAKU_PRIVATE_TEST || '-',
  };
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
