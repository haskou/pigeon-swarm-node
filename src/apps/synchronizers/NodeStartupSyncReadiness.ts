import NodeHeartbeatSender from '@app/contexts/nodes/application/send-heartbeat/NodeHeartbeatSender';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';

export default class NodeStartupSyncReadiness {
  constructor(
    private readonly heartbeatSender: NodeHeartbeatSender,
    private readonly ipfs: IPFS,
  ) {}

  private getPeerWaitTimeoutMs(): number {
    const configured = process.env.STARTUP_SYNC_PEER_WAIT_MS;

    if (configured !== undefined) {
      return Math.max(0, Number(configured) || 0);
    }

    return process.env.NODE_ENV === 'test' ? 0 : 10000;
  }

  private async sleep(milliseconds: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  private async connectedPeerCount(): Promise<number> {
    const networks = await this.ipfs.getNetworks();
    const peerIds = new Set(networks.flatMap((network) => network.getPeers()));

    return peerIds.size;
  }

  private async waitForPeerDiscovery(): Promise<number> {
    const timeoutMs = this.getPeerWaitTimeoutMs();
    const deadline = Date.now() + timeoutMs;
    let connectedPeerCount = await this.connectedPeerCount();

    while (connectedPeerCount === 0 && Date.now() < deadline) {
      await this.sleep(500);
      connectedPeerCount = await this.connectedPeerCount();
    }

    return connectedPeerCount;
  }

  public async prepare(): Promise<number> {
    await this.heartbeatSender.send();

    return this.waitForPeerDiscovery();
  }
}
