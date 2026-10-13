import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

/**
 * Identity admissions this node counted into each network during the current
 * window: the ones it accepted through its own API and the fresh ones it
 * observed replicating in. Local to the node and keyed only by network id.
 */
export default abstract class IdentityAdmissionLoadRepository {
  public abstract countRecent(networkId: NetworkId): Promise<number>;

  /**
   * Counts the identity once per network while any of its versions can still
   * be fresh, however often it is re-signed or seen. A network stops counting
   * once its load saturates the price.
   */
  public abstract record(
    identityId: IdentityId,
    networkIds: NetworkId[],
  ): Promise<void>;
}
