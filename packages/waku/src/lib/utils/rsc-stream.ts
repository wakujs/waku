function collectFlightChunks(root: unknown): Array<{ status: string }> {
  const seen = new Set();
  const chunks: Array<{ status: string }> = [];
  const stack: unknown[] = [root];
  while (stack.length) {
    const value = stack.pop();
    if (value === null || value === undefined) {
      continue;
    }
    const type = typeof value;
    if (type !== 'object' && type !== 'function') {
      continue;
    }
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    const v = value as Record<string, unknown>;
    if (Array.isArray(value)) {
      for (const item of value) {
        stack.push(item);
      }
      continue;
    }
    if (value instanceof Map) {
      for (const [key, item] of value) {
        stack.push(key);
        stack.push(item);
      }
      continue;
    }
    if (value instanceof Set) {
      for (const item of value) {
        stack.push(item);
      }
      continue;
    }
    if ('status' in v && typeof v.status === 'string') {
      chunks.push(v as { status: string });
      if (Array.isArray(v._children)) {
        for (const child of v._children) {
          stack.push(child);
        }
      }
      if ('value' in v) {
        stack.push(v.value);
      }
      if ('reason' in v) {
        stack.push(v.reason);
      }
      continue;
    }
    if ('_payload' in v) {
      stack.push(v._payload);
    }
    if (
      'handler' in v &&
      v.handler &&
      typeof v.handler === 'object' &&
      'chunk' in v.handler
    ) {
      stack.push((v.handler as Record<string, unknown>).chunk);
    }
    if ('_children' in v && Array.isArray(v._children)) {
      for (const child of v._children) {
        stack.push(child);
      }
    }
    if ('value' in v) {
      stack.push(v.value);
    }
    if ('props' in v) {
      stack.push(v.props);
    }
    for (const nested of Object.values(v)) {
      stack.push(nested);
    }
  }
  return chunks;
}

export async function waitForRootPrerequisites(root: unknown): Promise<void> {
  for (
    let stablePasses = 0, lastPendingCount = -1, lastChunkCount = -1;
    stablePasses < 2;
  ) {
    const chunks = collectFlightChunks(root);
    const unresolvedChunks = chunks.filter(
      (chunk) => chunk.status === 'pending' || chunk.status === 'blocked',
    );
    if (unresolvedChunks.length) {
      await Promise.allSettled(unresolvedChunks as unknown as Promise<void>[]);
    }
    await Promise.resolve();
    const nextChunks = collectFlightChunks(root);
    const pendingCount = nextChunks.filter(
      (chunk) => chunk.status === 'pending' || chunk.status === 'blocked',
    ).length;
    const chunkCount = nextChunks.length;
    if (
      pendingCount === 0 &&
      pendingCount === lastPendingCount &&
      chunkCount === lastChunkCount
    ) {
      stablePasses++;
    } else {
      stablePasses = 0;
      lastPendingCount = pendingCount;
      lastChunkCount = chunkCount;
    }
  }
}
