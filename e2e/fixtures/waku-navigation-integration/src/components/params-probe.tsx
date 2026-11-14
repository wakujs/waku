'use client';

import { useParams_UNSTABLE as useParams } from 'waku-navigation';

export const ParamsProbe = () => {
  const params = useParams({ from: '/hello/[name]' });
  return <p data-testid="params">{params?.name ?? 'none'}</p>;
};
