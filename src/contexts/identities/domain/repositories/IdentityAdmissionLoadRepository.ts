import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { IdentityExternalIdentifier } from '../value-objects/IdentityExternalIdentifier';

/**
 * Identity admissions this node counted into each network during the current
 * window: the ones it accepted through its own API and the fresh ones it
 * observed replicating in. Local to the node and keyed only by network id.
 */
export default abstract class IdentityAdmissionLoadRepository {
  public abstract countRecent(networkId: NetworkId): Promise<number>;

  /** Counts the published version once per network, however often it is seen. */
  public abstract record(
    externalIdentifier: IdentityExternalIdentifier,
    networkIds: NetworkId[],
  ): Promise<void>;
}
