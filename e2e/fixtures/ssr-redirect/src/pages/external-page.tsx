import { unstable_redirect as redirect } from 'waku/router/server';

// the port the spec listens on for the second origin
export default async function ExternalPage() {
  redirect('http://127.0.0.1:39876/from-render', 303);
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
