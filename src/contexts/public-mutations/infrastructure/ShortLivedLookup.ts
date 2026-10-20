/**
 * Coalesces repeated lookups made while admitting one batch of replicated
 * records. Entries expire quickly so revocations and permission changes are
 * observed within a second. Keys come from replicated record content, so the
 * expired entries are dropped (at most once per lifetime of an entry): the
 * map holds only what was looked up in the last second or two, however many
 * distinct keys a peer offers over time.
 */
export class ShortLivedLookup<TValue> {
  private static readonly TTL_MS = 1_000;

  private readonly entries = new Map<
    string,
    { expiresAt: number; value: Promise<TValue> }
  >();

  private sweptAt = 0;

  private sweepExpired(now: number): void {
    if (now - this.sweptAt < ShortLivedLookup.TTL_MS) return;

    this.sweptAt = now;

    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }

  public get(key: string, load: () => Promise<TValue>): Promise<TValue> {
    const now = Date.now();
    const cached = this.entries.get(key);

    if (cached && cached.expiresAt > now) return cached.value;

    this.sweepExpired(now);

    const value = load();

    this.entries.set(key, { expiresAt: now + ShortLivedLookup.TTL_MS, value });
    value.catch(() => this.entries.delete(key));

    return value;
  }
}
