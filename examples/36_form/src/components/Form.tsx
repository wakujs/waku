'use client';

import React from 'react';
import { useFormStatus } from 'react-dom';

const SubmitButton = () => {
  const { pending } = useFormStatus();
  return (
    <>
      <button disabled={pending} type="submit">
        Submit
      </button>
      {pending ? 'Pending...' : null}
    </>
  );
};

// export const Form = ({
//   message,
//   greet,
// }: {
//   message: Promise<string>;
//   greet: (formData: FormData) => Promise<void>;
// }) => (
//   <div style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}>
//     <p>{String(React.use(message))}</p>
//     {/* <p>{message}</p> */}
//     <form action={greet}>
//       Name: <input name="name" />
//       <SubmitButton />
//     </form>
//     <h3>This is a client component.</h3>
//   </div>
// );

export const Form = ({
  message,
  greet,
}: {
  message: Promise<string>;
  greet: (formData: FormData) => Promise<void>;
}) => {
  const inner = React.use(message);
  console.log({ inner })
  return <div style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}>
    <p>{inner}</p>
    {/* <p>{String(React.use(message))}</p> */}
    {/* <p>{message}</p> */}
    <form action={greet}>
      Name: <input name="name" />
      <SubmitButton />
    </form>
    <h3>This is a client component.</h3>
  </div>
}
