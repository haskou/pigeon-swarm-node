import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

/** Fixed-window event counter persisted in the node's local database. */
export default class FixedWindowCounter {
  private static async liveWindow(
    database: EmbeddedLocalDatabase,
    namespace: string,
    key: string,
  ): Promise<{ count: number; resetAt: number } | undefined> {
    const current = await database.findOne(namespace, key);

    return typeof current?.resetAt === 'number' &&
      current.resetAt > Date.now() &&
      typeof current.count === 'number'
      ? { count: current.count, resetAt: current.resetAt }
      : undefined;
  }

  /** Events recorded for `key` in the live window, without recording one. */
  public static async count(
    database: EmbeddedLocalDatabase,
    namespace: string,
    key: string,
  ): Promise<number> {
    const live = await FixedWindowCounter.liveWindow(database, namespace, key);

    return live?.count ?? 0;
  }

  /** Records one event for `key` and returns the count in the live window, including this event. */
  public static async increment(
    database: EmbeddedLocalDatabase,
    namespace: string,
    key: string,
    windowMs: number,
  ): Promise<number> {
    const live = await FixedWindowCounter.liveWindow(database, namespace, key);
    const count = (live?.count ?? 0) + 1;
    const resetAt = live?.resetAt ?? Date.now() + windowMs;

    await database.save(namespace, key, { count, resetAt });

    return count;
  }
}
