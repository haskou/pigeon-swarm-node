import NodeBlockExceptionsRepository from '../../domain/repositories/NodeBlockExceptionsRepository';
import NodeBlockSourceRepository from '../../domain/repositories/NodeBlockSourceRepository';
import NodeRepository from '../../domain/repositories/NodeRepository';
import { NonCanonicalIdentityIdsPurge } from './NonCanonicalIdentityIdsPurge';

/**
 * A node that ran before identity ids had to be canonical may hold aliases of
 * a key: as its owner, in its local block exceptions or in what an adopted
 * source applies. No request can be signed under one, so the node clears
 * such an owner, leaving the node to be claimed again, and drops such
 * entries. Signed source lists stay verbatim; their aliases are never
 * enforced. Canonical data is never written.
 */
export default class NonCanonicalIdentityIdsPurger {
  constructor(
    private readonly nodeRepository: NodeRepository,
    private readonly exceptionsRepository: NodeBlockExceptionsRepository,
    private readonly sourceRepository: NodeBlockSourceRepository,
  ) {}

  private async clearOwner(): Promise<boolean> {
    const node = await this.nodeRepository.loadLocalNode();

    if (!node.clearNonCanonicalOwner()) {
      return false;
    }

    await this.nodeRepository.updateLocalNode((latest) => {
      latest.clearNonCanonicalOwner();
    });

    return true;
  }

  private async purgeExceptions(): Promise<number> {
    const exceptions = await this.exceptionsRepository.find();
    const canonical = exceptions.canonical();
    const removed = exceptions.count() - canonical.count();

    if (removed > 0) {
      await this.exceptionsRepository.save(canonical);
    }

    return removed;
  }

  private async purgeApprovals(): Promise<number> {
    let removed = 0;

    for (const source of await this.sourceRepository.findAll()) {
      const dropped = source.dropNonCanonicalApprovals();

      if (dropped > 0) {
        await this.sourceRepository.save(source);
        removed += dropped;
      }
    }

    return removed;
  }

  public async purge(): Promise<NonCanonicalIdentityIdsPurge> {
    const ownerCleared = await this.clearOwner();
    const removedEntries =
      (await this.purgeExceptions()) + (await this.purgeApprovals());

    return { ownerCleared, removedEntries };
  }
}
