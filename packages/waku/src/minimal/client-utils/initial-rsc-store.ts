type Elements = Readonly<Record<string | symbol, unknown>>;

// The payload in the HTML can be read only once.
let claimedInitialRsc:
  [rscPath: string, elements: Promise<Elements>] | undefined;

export const claimInitialRsc = (
  rscPath: string,
  read: () => Promise<Elements> | undefined,
): Promise<Elements> | undefined => {
  if (claimedInitialRsc) {
    return claimedInitialRsc[0] === rscPath ? claimedInitialRsc[1] : undefined;
  }
  const elements = read();
  if (elements) {
    claimedInitialRsc = [rscPath, elements];
  }
  return elements;
};

export const releaseInitialRsc = (elements: Promise<Elements>): void => {
  if (claimedInitialRsc?.[1] === elements) {
    claimedInitialRsc = undefined;
  }
};
