import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Serializes the storage work of a scope (a community). The lock is
 * re-entrant for the async call chain that holds it: public mutation
 * policies run while a repository holds the scope and read other
 * repositories of the same scope, which take the same lock again.
 */
export default class PrivateAuthorizationStorageCoordinator {
  private readonly held = new AsyncLocalStorage<ReadonlySet<string>>();

  private readonly queues = new Map<string, Promise<void>>();

  public exclusivelyAll<T>(
    scopeIds: string[],
    action: () => Promise<T>,
  ): Promise<T> {
    const ids = [...new Set(scopeIds)].sort((left, right) =>
      left.localeCompare(right),
    );
    const run = (index: number): Promise<T> =>
      index === ids.length
        ? action()
        : this.exclusively(ids[index], () => run(index + 1));

    return run(0);
  }

  public async exclusively<T>(
    scopeId: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const held = this.held.getStore();

    if (held?.has(scopeId)) return action();

    const previous = this.queues.get(scopeId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.queues.set(scopeId, tail);
    await previous;

    try {
      return await this.held.run(new Set([...(held ?? []), scopeId]), action);
    } finally {
      release();

      if (this.queues.get(scopeId) === tail) {
        this.queues.delete(scopeId);
      }
    }
  }
}
