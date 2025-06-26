'use server';

import { SayHello } from '../components/say-hello.js';

export async function sayHello() {
  const promise = new Promise<string>((resolve) =>
    setTimeout(() => resolve('React'), 1000),
  );
  return <SayHello promise={promise} />;
}
