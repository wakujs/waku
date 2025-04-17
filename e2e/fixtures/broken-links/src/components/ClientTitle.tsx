'use client';

import { useEffect } from 'react';

export const ClientTitle = ({ children }: { children: string }) => {
  useEffect(() => {
    document.title = children;
  }, [children]);
  return null;
};
