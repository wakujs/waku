import type { CDPSession, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('performance-track');

test.describe('performance-track', () => {
  // Server Components performance tracks are flaky and require a Chromium trace
  // plus a React build that emits them, so this is opt-in via
  // `TEST_PERFORMANCE_TRACK=1` for local runs and is not exercised in CI.
  test.skip(!process.env.TEST_PERFORMANCE_TRACK);
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium only');
  test.skip(({ mode }) => mode !== 'DEV', 'Dev only');

  test('emits server component performance tracks', async ({ page }) => {
    const { port, stopApp } = await startApp('DEV');
    try {
      const session = await page.context().newCDPSession(page);

      // Trace the initial SSR render on its own.
      await startTracing(session);
      await page.goto(`http://localhost:${port}/`);
      await expect(
        page.getByText('SlowServerComponent resolved after 500ms'),
      ).toBeVisible();
      await waitForPerformanceFlush(page);
      const initialSpans = await stopTracingAndCollectSlowSpans(session);

      // Trace the client navigation and its on-demand RSC request on its own.
      await startTracing(session);
      await page.getByRole('link', { name: 'About' }).click();
      await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
      await expect(
        page.getByText('SlowServerComponent resolved after 500ms'),
      ).toBeVisible();
      await waitForPerformanceFlush(page);
      const navigationSpans = await stopTracingAndCollectSlowSpans(session);

      // Assert each phase independently so a broken SSR or navigation path
      // cannot be hidden by spans from the other. Each renders the nested
      // SlowServerComponent pair (300ms outer, 500ms inner).
      for (const spans of [initialSpans, navigationSpans]) {
        expect(spans.length).toBeGreaterThanOrEqual(2);
        expect(spans.every((span) => span.duration >= 200)).toBe(true);
      }
    } finally {
      await stopApp();
    }
  });
});

async function waitForPerformanceFlush(page: Page): Promise<void> {
  // React flushes performance info on a deferred task with no DOM signal.
  // eslint-disable-next-line playwright/no-wait-for-timeout
  await page.waitForTimeout(1000);
}

//
// CDP tracing helpers
//

// We drive the CDP `Tracing` domain (Tracing.start / tracingComplete stream,
// read via IO): https://chromedevtools.github.io/devtools-protocol/tot/Tracing/
// CDP leaves the individual event opaque (`dataCollected.value: object[]`), so
// this minimal shape follows Chrome's Trace Event Format instead:
// https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU
interface TraceEvent {
  cat: string;
  name: string;
  ph: string;
  ts: number;
  pid?: number;
  id?: string;
  id2?: { local?: string };
  args?: unknown;
}

// A named Server Components track entry with its measured duration (ms),
// derived from paired begin/end trace events.
interface ServerComponentSpan {
  name: string;
  duration: number;
}

async function startTracing(session: CDPSession): Promise<void> {
  await session.send('Tracing.start', {
    categories: '-*,devtools.timeline,blink.user_timing',
    transferMode: 'ReturnAsStream',
  });
}

async function stopTracingAndCollectSlowSpans(
  session: CDPSession,
): Promise<ServerComponentSpan[]> {
  const events = await stopTracing(session);
  return collectServerComponentSpans(events).filter(
    (span) => span.name === 'SlowServerComponent',
  );
}

function collectServerComponentSpans(
  events: TraceEvent[],
): ServerComponentSpan[] {
  const ends = new Map<string, TraceEvent>();
  for (const event of events) {
    if (event.ph !== 'e') {
      continue;
    }
    const key = asyncEventKey(event);
    if (key !== undefined) {
      ends.set(key, event);
    }
  }
  return events
    .filter(
      (event) =>
        event.ph === 'b' &&
        JSON.stringify(event.args).includes('Server Components'),
    )
    .flatMap((event) => {
      const key = asyncEventKey(event);
      if (key === undefined) {
        return [];
      }
      const end = ends.get(key);
      return [
        {
          name: event.name.replaceAll('\u200b', ''),
          duration: ((end?.ts ?? event.ts) - event.ts) / 1000,
        },
      ];
    });
}

// Chromium pairs nestable async events by category, name, and id (a local id is
// only unique within its emitting process, so it is scoped by pid). Events with
// no usable id are dropped rather than collapsed onto a shared key.
function asyncEventKey(event: TraceEvent): string | undefined {
  const localId = event.id2?.local;
  const id = localId ?? event.id;
  if (id === undefined) {
    return undefined;
  }
  const scope = localId !== undefined ? event.pid : undefined;
  return [event.cat, event.name, scope, id].join('\u0000');
}

async function stopTracing(session: CDPSession): Promise<TraceEvent[]> {
  const tracingComplete = new Promise<string>((resolve, reject) => {
    session.once('Tracing.tracingComplete', ({ stream }) => {
      if (stream) {
        resolve(stream);
      } else {
        reject(new Error('Trace stream is missing'));
      }
    });
  });
  await session.send('Tracing.end');
  const stream = await tracingComplete;
  let trace = '';
  for (;;) {
    const chunk = await session.send('IO.read', { handle: stream });
    trace += chunk.data;
    if (chunk.eof) {
      break;
    }
  }
  await session.send('IO.close', { handle: stream });
  return (JSON.parse(trace) as { traceEvents: TraceEvent[] }).traceEvents;
}
