import { unstable_createCustomError as createCustomError } from 'waku/minimal/server';

// the port the spec listens on for the second origin
export default async function ExternalPage() {
  throw createCustomError('leaving', {
    status: 303,
    location: 'http://127.0.0.1:39876/from-render',
  });
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
