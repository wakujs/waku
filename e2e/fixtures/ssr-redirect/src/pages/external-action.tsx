import { unstable_createCustomError as createCustomError } from 'waku/minimal/server';

export default async function ExternalActionPage() {
  return (
    <div>
      <h1>External Action Page</h1>
      <form
        action={async (formData: FormData) => {
          'use server';
          throw createCustomError('leaving', {
            status: 303,
            location: String(formData.get('to')),
          });
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
