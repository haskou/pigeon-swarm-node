import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NodePeerId } from '../value-objects/NodePeerId';

/**
 * Applies the effective blocks to the live runtime: libp2p connections on
 * every network and realtime sockets. Each call replaces the previous set.
 */
export default abstract class NodeBlockEnforcer {
  public abstract enforce(
    identityIds: IdentityId[],
    nodePeerIds: NodePeerId[],
  ): Promise<void>;
}
