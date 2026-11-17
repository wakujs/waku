import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import { requestRedirect } from 'waku/router/server';

export default async function ExternalActionPage() {
  return (
    <div>
      <h1>External Action Page</h1>
      <form
        action={async (formData: FormData) => {
          'use server';
          // a URL, because an allowlisted target is a variable, not a literal
          requestRedirect(new URL(String(formData.get('to'))));
          cancelRender();
        }}
      >
        <input name="to" data-testid="to" defaultValue="" />
        <button type="submit">Leave</button>
      </form>
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
