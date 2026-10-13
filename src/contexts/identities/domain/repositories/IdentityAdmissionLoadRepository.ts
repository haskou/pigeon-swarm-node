import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

/**
 * Identity admissions this node accepted into each network during the current
 * window. Local to the node and keyed only by network id.
 */
export default abstract class IdentityAdmissionLoadRepository {
  public abstract countRecent(networkId: NetworkId): Promise<number>;

  public abstract record(networkIds: NetworkId[]): Promise<void>;
}
