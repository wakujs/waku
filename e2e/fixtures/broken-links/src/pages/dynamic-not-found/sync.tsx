import { unstable_notFound as notFound } from 'waku/router/server';

export default function SyncPage() {
  notFound();
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
