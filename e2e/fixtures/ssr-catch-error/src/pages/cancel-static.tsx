import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';

const Cancel = async () => {
  await Promise.resolve();
  return cancelRender();
};

export default function CancelStaticPage() {
  return <Cancel />;
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
