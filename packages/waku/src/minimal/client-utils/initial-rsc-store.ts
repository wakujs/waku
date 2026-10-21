type Elements = Readonly<Record<string | symbol, unknown>>;

type InitialRscEntry = [
  rscPath: string,
  rscParams: unknown,
  elements: Promise<Elements>,
];

// An abandoned suspended render has no cleanup, so this cache must be bounded.
const INITIAL_RSC_ENTRY_LIMIT = 32;
const initialRscEntries: InitialRscEntry[] = [];

export const createInitialRscStore = (
  initial: Promise<Elements> | undefined,
) => {
  let elements = initial ?? null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => elements,
    getServerSnapshot: () => {
      if (!elements) {
        throw new Error('Missing initial RSC payload for hydration');
      }
      return elements;
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load: (fetchElements: () => Promise<Elements>) => {
      if (!elements) {
        elements = fetchElements();
        listeners.forEach((listener) => listener());
      }
      return elements;
    },
  };
};

export const clearInitialRscEntries = (): void => {
  initialRscEntries.length = 0;
};

export const getInitialRscEntry = (
  rscPath: string,
  rscParams: unknown,
  create: () => Promise<Elements> | undefined,
): Promise<Elements> | undefined => {
  const index = initialRscEntries.findIndex(
    (item) => item[0] === rscPath && item[1] === rscParams,
  );
  if (index !== -1) {
    const entry = initialRscEntries[index]!;
    initialRscEntries.splice(index, 1);
    initialRscEntries.push(entry);
    return entry[2];
  }
  const elements = create();
  if (!elements) {
    return;
  }
  if (initialRscEntries.length === INITIAL_RSC_ENTRY_LIMIT) {
    void initialRscEntries.shift();
  }
  initialRscEntries.push([rscPath, rscParams, elements]);
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
