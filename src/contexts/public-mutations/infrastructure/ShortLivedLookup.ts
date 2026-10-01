/**
 * Coalesces repeated lookups made while admitting one batch of replicated
 * records. Entries expire quickly so revocations and permission changes are
 * observed within a second.
 */
export class ShortLivedLookup<TValue> {
  private static readonly TTL_MS = 1_000;

  private readonly entries = new Map<
    string,
    { expiresAt: number; value: Promise<TValue> }
  >();

  public get(key: string, load: () => Promise<TValue>): Promise<TValue> {
    const now = Date.now();
    const cached = this.entries.get(key);

    if (cached && cached.expiresAt > now) return cached.value;

    const value = load();

    this.entries.set(key, { expiresAt: now + ShortLivedLookup.TTL_MS, value });
    value.catch(() => this.entries.delete(key));

    return value;
  }
}
