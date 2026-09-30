type Elements = Readonly<Record<string | symbol, unknown>>;

type InitialRscEntry = [
  rscPath: string,
  rscParams: unknown,
  elements: Promise<Elements>,
];

// An abandoned suspended render has no cleanup, so this cache must be bounded.
const INITIAL_RSC_ENTRY_LIMIT = 32;
// React renders a suspended Root again from scratch soon after its fetch
// settles, and once more in the same task when that render throws. Both have
// to throw a rejection rather than fetch again, so a rejected entry is kept
// until the end of the task that first reads it, and at most this long, as the
// render that suspended on it may have been abandoned. A Root mounted later,
// say by an error boundary that resets, fetches again.
const REJECTED_ENTRY_TIMEOUT = 1000;
const initialRscEntries: InitialRscEntry[] = [];
const rejectedElements = new WeakSet<Promise<Elements>>();

export const clearInitialRscEntries = (): void => {
  initialRscEntries.length = 0;
};

export const getInitialRscEntry = (
  rscPath: string,
  rscParams: unknown,
  create: () => Promise<Elements>,
): Promise<Elements> => {
  const index = initialRscEntries.findIndex(
    (item) => item[0] === rscPath && item[1] === rscParams,
  );
  if (index !== -1) {
    const entry = initialRscEntries[index]!;
    initialRscEntries.splice(index, 1);
    initialRscEntries.push(entry);
    if (rejectedElements.has(entry[2])) {
      setTimeout(() => releaseInitialRscEntry(...entry));
    }
    return entry[2];
  }
  const elements = create();
  if (initialRscEntries.length === INITIAL_RSC_ENTRY_LIMIT) {
    void initialRscEntries.shift();
  }
  initialRscEntries.push([rscPath, rscParams, elements]);
  void elements.then(undefined, () => {
    rejectedElements.add(elements);
    setTimeout(
      () => releaseInitialRscEntry(rscPath, rscParams, elements),
      REJECTED_ENTRY_TIMEOUT,
    );
  });
  return elements;
};

export const releaseInitialRscEntry = (
  rscPath: string,
  rscParams: unknown,
  elements: Promise<Elements>,
): void => {
  const index = initialRscEntries.findIndex(
    (item) =>
      item[0] === rscPath && item[1] === rscParams && item[2] === elements,
  );
  if (index !== -1) {
    initialRscEntries.splice(index, 1);
  }
};
