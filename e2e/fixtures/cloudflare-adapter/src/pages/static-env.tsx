import { getEnv } from 'waku';

export default function StaticEnvPage() {
  return <div data-testid="static-env">GREETING={getEnv('GREETING')}</div>;
}

export const getConfig = async () => ({ render: 'static' }) as const;
