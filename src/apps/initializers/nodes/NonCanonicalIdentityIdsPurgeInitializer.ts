import NonCanonicalIdentityIdsPurger from '@app/contexts/nodes/application/purge-non-canonical-identity-ids/NonCanonicalIdentityIdsPurger';
import Kernel from '@haskou/ddd-kernel';

/**
 * Purges, at every startup and before blocks are enforced or a request is
 * served, identity ids that are not the canonical encoding of a key. It logs
 * counts only, never an id, and warns when the node was left unclaimed.
 */
export default class NonCanonicalIdentityIdsPurgeInitializer {
  constructor(private readonly purger: NonCanonicalIdentityIdsPurger) {}

  public async ensure(): Promise<void> {
    const { ownerCleared, ownListDropped, removedEntries } =
      await this.purger.purge();

    if (ownerCleared || ownListDropped || removedEntries > 0) {
      Kernel.logger.info(
        `Purged non-canonical identity ids: ownerCleared=${ownerCleared} ownListDropped=${ownListDropped} removedEntries=${removedEntries}`,
      );
    }

    if (ownerCleared) {
      Kernel.logger.warn(
        'The stored node owner was not a canonical identity id and was cleared: this node is unclaimed and the first signed PUT /node/owner claims it. Stop the node and run yarn node:reset-owner <owner identity id> to name the owner.',
      );
    }
  }
}
