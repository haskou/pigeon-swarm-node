import NonCanonicalIdentityIdsPurger from '@app/contexts/nodes/application/purge-non-canonical-identity-ids/NonCanonicalIdentityIdsPurger';
import Kernel from '@haskou/ddd-kernel';

/**
 * Purges, at every startup and before blocks are enforced, identity ids that
 * are not the canonical encoding of a key. It logs counts only, never an id.
 */
export default class NonCanonicalIdentityIdsPurgeInitializer {
  constructor(private readonly purger: NonCanonicalIdentityIdsPurger) {}

  public async ensure(): Promise<void> {
    const { ownerCleared, removedEntries } = await this.purger.purge();

    if (ownerCleared || removedEntries > 0) {
      Kernel.logger.info(
        `Purged non-canonical identity ids: ownerCleared=${ownerCleared} removedEntries=${removedEntries}`,
      );
    }
  }
}
