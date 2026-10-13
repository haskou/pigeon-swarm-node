/**
 * Whether an OrbitDB failure only means a block could not be loaded yet: the
 * local blockstore misses it and no connected peer served it before the OrbitDB
 * block timeout. Retrying once peers exchange heads can succeed.
 */
export function isOrbitDBTransientBlockError(error: unknown): boolean {
  const message = String(error);

  return (
    message.includes('LoadBlockFailedError') ||
    message.includes('Failed to load block') ||
    message.includes('Want was aborted') ||
    message.includes('TimeoutError') ||
    message.includes('operation was aborted due to timeout')
  );
}
