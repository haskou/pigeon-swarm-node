import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export default class OrbitDBDeviceAuthorizationIdentityLock {
  private readonly identityQueues = new Map<string, Promise<void>>();

  public async run<T>(
    identityId: IdentityId,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = identityId.valueOf();
    const previous = this.identityQueues.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);

    this.identityQueues.set(key, queued);
    await previous;

    try {
      return await operation();
    } finally {
      release();

      if (this.identityQueues.get(key) === queued) {
        this.identityQueues.delete(key);
      }
    }
  }
}
