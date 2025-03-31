'use client';
import { PropsWithChildren, ReactElement } from 'react';
import { ThemeProvider } from 'next-themes';

export const Layout = ({ children }: PropsWithChildren): ReactElement => {
  return <ThemeProvider attribute="class">{children}</ThemeProvider>;
};
