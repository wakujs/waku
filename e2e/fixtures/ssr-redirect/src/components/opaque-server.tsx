'use server';

import { OpaqueResult } from './opaque-result';

export async function echoOpaque(value: unknown) {
  return { value, element: <OpaqueResult value={value} /> };
}
