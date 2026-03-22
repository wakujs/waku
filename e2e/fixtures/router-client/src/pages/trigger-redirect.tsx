import { unstable_redirect as redirect } from 'waku/router/server';

export default function TriggerRedirectPage() {
  redirect('/next?from=redirect');
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
