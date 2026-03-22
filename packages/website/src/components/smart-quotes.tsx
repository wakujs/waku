'use client';

import { useEffect } from 'react';
import smartquotes from 'smartquotes';

export function SmartQuotes() {
  useEffect(() => {
    smartquotes().listen();
  }, []);

  return null;
}
