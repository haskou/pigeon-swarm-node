/**
 * Runs actions one at a time per key, in arrival order; different keys run in
 * parallel. An action that runs another action on its own key waits for
 * itself, so sections on one key must not nest.
 */
export class KeyedSerialQueue {
  private readonly tails = new Map<string, Promise<void>>();

  public async run<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const { promise: current, resolve: release } =
      Promise.withResolvers<void>();
    const tail = previous.then(() => current);

    this.tails.set(key, tail);
    await previous;

    try {
      return await action();
    } finally {
      release();

      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    }
  }
}
