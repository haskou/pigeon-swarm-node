import NonCanonicalIdentityIdsPurger from '@app/contexts/nodes/application/purge-non-canonical-identity-ids/NonCanonicalIdentityIdsPurger';
import Kernel from '@haskou/ddd-kernel';

/**
 * Purges, at every startup and before blocks are enforced or a request is
 * served, identity ids that are not the canonical encoding of a key. It logs
 * counts only, never an id, and warns when an owner was cleared.
 */
export default class NonCanonicalIdentityIdsPurgeInitializer {
  constructor(private readonly purger: NonCanonicalIdentityIdsPurger) {}

  public async ensure(): Promise<void> {
    const { ownerCleared, ownListNonCanonicalEntries, removedEntries } =
      await this.purger.purge();

    if (ownerCleared || removedEntries > 0) {
      Kernel.logger.info(
        `Purged non-canonical identity ids: ownerCleared=${ownerCleared} removedEntries=${removedEntries}`,
      );
    }

    if (ownListNonCanonicalEntries > 0) {
      Kernel.logger.warn(
        `The node own block list holds ${ownListNonCanonicalEntries} non-canonical identity ids: it is kept and enforced locally, NOT published, and must be re-signed with a higher version.`,
      );
    }

    if (ownerCleared) {
      Kernel.logger.warn(
        'The stored node owner was not a canonical identity id and was cleared: this node refuses every owner claim until the node operator runs yarn node:reset-owner <owner identity id> to name the owner.',
      );
    }
  }
}
