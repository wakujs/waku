'use client';

import { createContext } from 'react';
import type { ReactNode } from 'react';

export const Context = createContext('original');

export const ContextProvider = ({ children }: { children: ReactNode }) => {
  return <Context value="provider value">{children}</Context>;
};
