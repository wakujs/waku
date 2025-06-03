import type { JSX, ReactElement } from 'react';
import parse from 'html-react-parser';

export const parseHtml = (html: string): ReactElement[] => {
  // @ts-expect-error no types
  const elements: string | JSX.Element | JSX.Element[] = parse(html);
  if (typeof elements === 'string') {
    throw new Error('Parsed HTML is a string, expected JSX elements');
  }
  if (Array.isArray(elements)) {
    return elements.filter((element) => typeof element !== 'string');
  }
  return [elements];
};
