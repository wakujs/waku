import { type ReactNode, Suspense } from 'react';

// Awaits `delay` before rendering `children`. Because a child element only
// renders once its parent resolves, nesting these produces a sequential
// waterfall (300ms, then 500ms) that appears as a staircase in React's
// "Server Components" performance track rather than overlapping spans.
async function SlowServerComponent({
  delay,
  children,
}: {
  delay: number;
  children: ReactNode;
}) {
  await new Promise((resolve) => setTimeout(resolve, delay));
  return children;
}

// `pathname` keys the outer Suspense so the whole waterfall remounts on each
// navigation, giving one fresh pair of SlowServerComponent spans per render.
export function PerfProbe({ pathname }: { pathname: string }) {
  return (
    <section>
      <h2>Nested Suspense</h2>
      <Suspense key={pathname} fallback={<p>Loading...</p>}>
        <SlowServerComponent delay={300}>
          <p>SlowServerComponent resolved after 300ms</p>
          <section>
            <Suspense fallback={<p>Loading...</p>}>
              <SlowServerComponent delay={500}>
                <p>SlowServerComponent resolved after 500ms</p>
              </SlowServerComponent>
            </Suspense>
          </section>
        </SlowServerComponent>
      </Suspense>
    </section>
  );
}
