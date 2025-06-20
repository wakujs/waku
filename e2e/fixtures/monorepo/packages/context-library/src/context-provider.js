'use client';

import { createContext, createElement } from 'react';

export const Context = createContext('original');

export const ContextProvider = ({ children }) => {
  return createElement(Context, { value: 'provider value' }, children);
};
