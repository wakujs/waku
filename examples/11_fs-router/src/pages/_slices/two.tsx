import type { ReactNode } from 'react';

export default function SliceTwo({ children }: { children: ReactNode }) {
  return (
    <div>
      <h2 className="text-2xl font-bold">
        Slice Two {new Date().toLocaleString()}
      </h2>
      <p>Children={children}</p>
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  };
};
