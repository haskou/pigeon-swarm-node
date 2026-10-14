import { ContentReplicationNetworkBudget } from '@app/contexts/content-replication/domain/ContentReplicationNetworkBudget';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

/** Reads this node's per-network replication budget, falling back to the domain default. */
export class ContentReplicationNetworkBudgetFromEnvironment {
  public static load(): ContentReplicationNetworkBudget {
    const bytes = pigeonEnvironment().CONTENT_REPLICATION_NETWORK_BUDGET_BYTES;

    return new ContentReplicationNetworkBudget(
      Number.isSafeInteger(bytes) && bytes > 0
        ? bytes
        : ContentReplicationNetworkBudget.DEFAULT_BYTES,
    );
  }
}
