'use client';

export const OnlyClient = () => {
  if (typeof window === 'undefined') {
    throw new Error('This component must be used in a client context');
  }
  return <h3>Only client component</h3>;
};
