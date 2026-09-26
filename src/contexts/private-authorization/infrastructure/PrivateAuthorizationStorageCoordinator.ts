export default class PrivateAuthorizationStorageCoordinator {
  private readonly queues = new Map<string, Promise<void>>();

  public async exclusively<T>(
    scopeId: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const previous = this.queues.get(scopeId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.queues.set(scopeId, tail);
    await previous;

    try {
      return await action();
    } finally {
      release();

      if (this.queues.get(scopeId) === tail) {
        this.queues.delete(scopeId);
      }
    }
  }
}
