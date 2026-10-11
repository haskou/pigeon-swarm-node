import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

/** Fixed-window event counter persisted in the node's local database. */
export default class FixedWindowCounter {
  /** Records one event for `key` and returns the count in the live window, including this event. */
  public static async increment(
    database: EmbeddedLocalDatabase,
    namespace: string,
    key: string,
    windowMs: number,
  ): Promise<number> {
    const now = Date.now();
    const current = await database.findOne(namespace, key);
    const live =
      typeof current?.resetAt === 'number' &&
      current.resetAt > now &&
      typeof current.count === 'number';
    const count = live ? (current.count as number) + 1 : 1;
    const resetAt = live ? (current.resetAt as number) : now + windowMs;

    await database.save(namespace, key, { count, resetAt });

    return count;
  }
}
