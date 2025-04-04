'use server';

export const ping = async () => {
  return 'pong';
};

export const increase = async (value: number) => {
  return value + 1;
};

export const wrap = async (node: React.ReactNode) => {
  return <span className="via-server">{node}</span>;
};
