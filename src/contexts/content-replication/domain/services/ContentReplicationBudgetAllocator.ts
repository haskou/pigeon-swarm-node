import { Integer } from '@haskou/value-objects';

import { ContentReplication } from '../ContentReplication';
import { ContentReplicationNetworkBudget } from '../ContentReplicationNetworkBudget';
import { ContentReplicationBudgetClaim } from './ContentReplicationBudgetClaim';

/**
 * Shares one network's replication budget among owners, max-min fairly: each
 * owner's registrations are taken smallest first, and the next registration
 * served is always one whose owner holds the fewest bytes so far. Owning more
 * identities still buys more shares, but no owner can starve one that holds
 * less than the fair share. Deterministic: the input order is irrelevant.
 */
export default class ContentReplicationBudgetAllocator {
  private static byOwner(
    replications: ContentReplication[],
  ): ContentReplication[][] {
    const owners = new Map<string, ContentReplication[]>();

    replications.forEach((replication) => {
      const owner = replication.getOwnerIdentityId().valueOf();
      const owned = owners.get(owner);

      if (owned) {
        owned.push(replication);

        return;
      }

      owners.set(owner, [replication]);
    });

    return [...owners.values()].map((owned) =>
      owned.sort(ContentReplicationBudgetAllocator.compareReplications),
    );
  }

  private static compareReplications(
    left: ContentReplication,
    right: ContentReplication,
  ): number {
    if (left.getSizeBytes().isLessThan(right.getSizeBytes())) {
      return -1;
    }

    if (left.getSizeBytes().isGreaterThan(right.getSizeBytes())) {
      return 1;
    }

    return left.getCid().valueOf().localeCompare(right.getCid().valueOf());
  }

  private static compareClaims(
    left: ContentReplicationBudgetClaim,
    right: ContentReplicationBudgetClaim,
  ): number {
    if (left.ownerHeldBytes.isLessThan(right.ownerHeldBytes)) {
      return -1;
    }

    if (left.ownerHeldBytes.isGreaterThan(right.ownerHeldBytes)) {
      return 1;
    }

    const bySize = ContentReplicationBudgetAllocator.compareReplications(
      left.replication,
      right.replication,
    );

    if (bySize !== 0) {
      return bySize;
    }

    return left.replication
      .getOwnerIdentityId()
      .valueOf()
      .localeCompare(right.replication.getOwnerIdentityId().valueOf());
  }

  private static claimsOf(
    owned: ContentReplication[],
  ): ContentReplicationBudgetClaim[] {
    let ownerHeldBytes = new Integer(0);

    return owned.map((replication) => {
      const claim = { ownerHeldBytes, replication };

      ownerHeldBytes = new Integer(
        ownerHeldBytes.add(replication.getSizeBytes()),
      );

      return claim;
    });
  }

  /** Registrations of one network this node holds within the budget. */
  public select(
    replications: ContentReplication[],
    budget: ContentReplicationNetworkBudget,
  ): ContentReplication[] {
    const claims = ContentReplicationBudgetAllocator.byOwner(replications)
      .flatMap(ContentReplicationBudgetAllocator.claimsOf)
      .sort(ContentReplicationBudgetAllocator.compareClaims);
    const exhaustedOwners = new Set<string>();
    const selected: ContentReplication[] = [];
    let remaining = new Integer(budget.bytes);

    claims.forEach(({ replication }) => {
      const owner = replication.getOwnerIdentityId().valueOf();

      if (exhaustedOwners.has(owner)) {
        return;
      }

      if (replication.getSizeBytes().isGreaterThan(remaining)) {
        exhaustedOwners.add(owner);

        return;
      }

      remaining = new Integer(remaining.subtract(replication.getSizeBytes()));
      selected.push(replication);
    });

    return selected;
  }
}
