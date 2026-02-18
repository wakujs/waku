import { unstable_notFound as notFound } from 'waku/router/server';

export default function TriggerNotFoundPage() {
  notFound();
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
