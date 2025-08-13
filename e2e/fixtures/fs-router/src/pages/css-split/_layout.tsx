import type { PropsWithChildren } from 'react';
import { Link } from 'waku';

export default function Layout(props: PropsWithChildren) {
  return (
    <div>
      <h4>Css code split test (page1: red, page2: blue)</h4>
      <ul>
        <li>
          <Link to="/css-split/page1">Page 1</Link>
        </li>
        <li>
          <Link to="/css-split/page1/nested">Page 1 Nested</Link>
        </li>
        <li>
          <Link to="/css-split/page2">Page 2</Link>
        </li>
        <li>
          <Link to="/css-split/page2/nested">Page 2 Nested</Link>
        </li>
      </ul>
      <div>{props.children}</div>
    </div>
  );
}
