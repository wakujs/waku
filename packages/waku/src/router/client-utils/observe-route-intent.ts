type Outcome = { value: string | undefined } | { error: unknown };
type Listener = (outcome: Outcome) => void;

const observations = new WeakMap<
  PromiseLike<string | undefined>,
  { outcome?: Outcome; listeners: Set<Listener> }
>();

/** Observe each wire promise once, without retaining obsolete render scopes. */
export const observeRouteIntent = (
  promise: PromiseLike<string | undefined>,
  listener: Listener,
) => {
  let observation = observations.get(promise);
  if (!observation) {
    observation = { listeners: new Set() };
    observations.set(promise, observation);
    const entry = observation;
    const publish = (outcome: Outcome) => {
      entry.outcome = outcome;
      const listeners = [...entry.listeners];
      entry.listeners.clear();
      for (const notify of listeners) {
        notify(outcome);
      }
    };
    Promise.resolve(promise).then(
      (value) => publish({ value }),
      (error: unknown) => publish({ error }),
    );
  }
  const entry = observation;
  entry.listeners.add(listener);
  if (entry.outcome) {
    queueMicrotask(() => {
      if (entry.listeners.delete(listener)) {
        listener(entry.outcome!);
      }
    });
  }
  return () => {
    entry.listeners.delete(listener);
  };
};
