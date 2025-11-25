'use client';

import { ComponentProps } from 'react';
import { Link, useRouter } from 'waku';

export function ClickLink(
  props: ComponentProps<typeof Link> & { replace?: boolean },
) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (props.replace) {
          router.replace(props.to);
        } else {
          router.push(props.to);
        }
      }}
    >
      {props.children}
    </button>
  );
}
