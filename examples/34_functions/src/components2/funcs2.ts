'use server';

import { unstable_getRequest as getRequest } from 'waku/server';

export const greet = async (name: string) => {
  await Promise.resolve();
  return `Hello ${name} from server!`;
};

export const hello = async (name: string) => {
  await Promise.resolve();
  console.log('Request:', getRequest());
  console.log('Hello', name, '!');
};
