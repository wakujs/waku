'use client';

import { ComponentProps } from 'react';
import { Link, useRouter } from 'waku';

export function ClickLink(
  props: ComponentProps<typeof Link> & { replace?: boolean },
) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        if (props.replace) {
          await router.replace(props.to);
        } else {
          await router.push(props.to);
        }
      }}
    >
      {props.children}
    </button>
  );
}
