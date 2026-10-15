import NodeBlockEnforcer from '@app/contexts/nodes/domain/services/NodeBlockEnforcer';
import { NodePeerId } from '@app/contexts/nodes/domain/value-objects/NodePeerId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { nodePeerConnectionGate } from '@app/contexts/shared/infrastructure/ipfs/helia/NodePeerConnectionGate';
import { libp2pKeyAdapter } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { webSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';

/**
 * Feeds the process-wide libp2p connection gate and the realtime hub, then
 * drops open connections of newly blocked peers on every network. This
 * node's own peer id is never blocked.
 */
export default class RuntimeNodeBlockEnforcer extends NodeBlockEnforcer {
  constructor(private readonly networkRegistry: IPFSNetworkRegistry) {
    super();
  }

  private async withoutOwnPeerId(nodePeerIds: NodePeerId[]): Promise<string[]> {
    if (nodePeerIds.length === 0) {
      return [];
    }

    const ownPeerId = libp2pKeyAdapter.peerIdFromPrivateKey(
      await this.networkRegistry.getSharedPeerPrivateKey(),
    );

    return nodePeerIds
      .map((peerId) => peerId.valueOf())
      .filter((peerId) => peerId !== ownPeerId);
  }

  public async enforce(
    identityIds: IdentityId[],
    nodePeerIds: NodePeerId[],
  ): Promise<void> {
    webSocketEventHub.blockIdentities(identityIds);

    const newlyBlocked = await nodePeerConnectionGate.replace(
      await this.withoutOwnPeerId(nodePeerIds),
    );

    await Promise.allSettled(
      this.networkRegistry
        .getAll()
        .flatMap((network) =>
          newlyBlocked.map((peerId) => network.disconnectPeer(peerId)),
        ),
    );
  }
}
