import { ConnectionGater } from './types/ConnectionGater';
import { PeerId } from './types/PeerId';

/**
 * Process-wide set of libp2p peer ids this node refuses to connect with,
 * inbound and outbound, on every network. The node block policy feeds it;
 * every libp2p node of this process shares its gater.
 */
export class NodePeerConnectionGate {
  private blockedPeerIds: ReadonlySet<string> = new Set();
  private readonly blockListeners = new Set<
    (peerIds: string[]) => Promise<void>
  >();

  private denies(peerId: PeerId): Promise<boolean> {
    return Promise.resolve(this.blockedPeerIds.has(peerId.toString()));
  }

  public connectionGater(): ConnectionGater {
    return {
      denyDialPeer: (peerId: PeerId): Promise<boolean> => this.denies(peerId),
      denyInboundEncryptedConnection: (peerId: PeerId): Promise<boolean> =>
        this.denies(peerId),
      denyOutboundConnection: (peerId: PeerId): Promise<boolean> =>
        this.denies(peerId),
    };
  }

  /** Libp2p nodes outside the network registry register here to drop connections of newly blocked peers. */
  public onPeersBlocked(listener: (peerIds: string[]) => Promise<void>): void {
    this.blockListeners.add(listener);
  }

  /** Replaces the blocked set and returns the peer ids that were not blocked before. */
  public async replace(peerIds: string[]): Promise<string[]> {
    const previous = this.blockedPeerIds;

    this.blockedPeerIds = new Set(peerIds);

    const newlyBlocked = peerIds.filter((peerId) => !previous.has(peerId));

    if (newlyBlocked.length > 0) {
      await Promise.all(
        [...this.blockListeners].map((listener) => listener(newlyBlocked)),
      );
    }

    return newlyBlocked;
  }
}

export const nodePeerConnectionGate = new NodePeerConnectionGate();
