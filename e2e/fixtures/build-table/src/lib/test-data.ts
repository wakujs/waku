const data = Array(1000)
  .fill(0)
  .map(() => ({
    id: crypto.randomUUID(),
    name: crypto.randomUUID(),
  }));

export function testData(): Promise<{ id: string; name: string }[]> {
  return new Promise((res) => setImmediate(() => res(data)));
}
