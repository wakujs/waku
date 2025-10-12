/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { useEffect } from 'react';
import { useScroll } from 'framer-motion';
import { useSetAtom } from 'jotai';
import { scrolledAtom } from '../atoms';

export const Scroll = () => {
  const { scrollY } = useScroll();
  const setHasScrolled = useSetAtom(scrolledAtom);

  useEffect(() => {
    return scrollY.on('change', (latest) => {
      if (latest >= 100) {
        setHasScrolled(true);
      } else {
        setHasScrolled(false);
      }
    });
  }, []);

  return null;
};
