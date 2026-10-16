import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyedSerialQueue } from '@app/shared/infrastructure/concurrency/KeyedSerialQueue';

/**
 * One publication per identity at a time, from creation check to publish (or
 * the release of its registration code use). Concurrent creations of one
 * identity are then one creation: the next sees the identity held and spends
 * no code use.
 */
export default class IdentityCreationQueue {
  private readonly queue = new KeyedSerialQueue();

  public async run<T>(
    identityId: IdentityId,
    action: () => Promise<T>,
  ): Promise<T> {
    return this.queue.run(identityId.valueOf(), action);
  }
}
