'use server';

import { requestRedirect, requestRefresh } from 'waku/router/server';
import { incrementRerenderOrderCount } from './rerender-order-store.js';

const PAGES = [
  '/nested/foo',
  '/nested/bar',
  '/nested/aaa',
  '/nested/bbb',
] as const;

export const jump = async () => {
  const page = PAGES[Math.floor(Math.random() * PAGES.length)]!;
  console.log(`Jumping to ${page}`);
  requestRedirect(page);
};

export const jumpToNestedBaz = async () => {
  requestRedirect('/nested/baz');
};

export const throws = async (input: string): Promise<string> => {
  if (!input) {
    throw new Error('Input is required');
  }
  return input;
};

// wakujs/waku#2288
export const bumpRerenderOrder = async (mode: string) => {
  incrementRerenderOrderCount(mode);
  requestRefresh();
};
