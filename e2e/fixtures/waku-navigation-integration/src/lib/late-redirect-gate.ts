// Server-side gates the e2e spec opens to time the late redirect.
const gates = new Map<string, () => void>();
const released = new Set<string>();

export const waitForRelease = (id: string) =>
  new Promise<void>((resolve) => {
    if (released.delete(id)) {
      resolve();
      return;
    }
    // a test that fails before releasing must not leave the stream open
    const timeout = setTimeout(resolve, 30_000);
    gates.set(id, () => {
      clearTimeout(timeout);
      resolve();
    });
  });

export const release = (id: string) => {
  const open = gates.get(id);
  if (open) {
    gates.delete(id);
    open();
  } else {
    released.add(id);
  }
};
