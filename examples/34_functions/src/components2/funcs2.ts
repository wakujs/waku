'use server';

import { unstable_getContext as getContext } from 'waku/server';

export const greet = async (name: string) => {
  await Promise.resolve();
  return `Hello ${name} from server!`;
};

export const hello = async (name: string) => {
  await Promise.resolve();
  console.log('Context:', getContext());
  console.log('Hello', name, '!');
};
