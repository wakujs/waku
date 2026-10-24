export type RouteIntentOutcome =
  { value: string | undefined } | { error: unknown };
type Listener = (outcome: RouteIntentOutcome) => void;

const observationsByPromise = new WeakMap<
  PromiseLike<string | undefined>,
  { outcome?: RouteIntentOutcome; listeners: Set<Listener> }
>();

const getObservation = (promise: PromiseLike<string | undefined>) => {
  let observation = observationsByPromise.get(promise);
  if (!observation) {
    observation = { listeners: new Set() };
    observationsByPromise.set(promise, observation);
    const entry = observation;
    const publish = (outcome: RouteIntentOutcome) => {
      entry.outcome = outcome;
      const listeners = [...entry.listeners];
      entry.listeners.clear();
      for (const notify of listeners) {
        notify(outcome);
      }
    };
    void promise.then(
      (value) => publish({ value }),
      (error: unknown) => publish({ error }),
    );
  }
  return observation;
};

export async function getRouteIntentOutcome(
  promise: PromiseLike<string | undefined>,
) {
  const entry = getObservation(promise);
  await Promise.resolve();
  return entry.outcome;
}

export function observeRouteIntent(
  promise: PromiseLike<string | undefined>,
  listener: Listener,
) {
  const entry = getObservation(promise);
  if (entry.outcome) {
    listener(entry.outcome);
  } else {
    entry.listeners.add(listener);
  }
  return () => {
    entry.listeners.delete(listener);
  };
}
