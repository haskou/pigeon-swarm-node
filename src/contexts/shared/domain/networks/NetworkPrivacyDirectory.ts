import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

/**
 * Tells whether a network is private, that is reachable only by its members.
 * Direct conversations and private communities may be placed only on a
 * private network.
 */
export default abstract class NetworkPrivacyDirectory {
  public abstract isPrivate(networkId: NetworkId): boolean;
}
