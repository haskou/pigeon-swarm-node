import NodeHeartbeatSender from '@app/contexts/nodes/application/send-heartbeat/NodeHeartbeatSender';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';

export type NodeStartupNetworkReadiness = {
  networkId: string;
  peerCount: number;
  ready: boolean;
};

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

  private async getNetworkReadiness(
    networkIds: string[],
  ): Promise<NodeStartupNetworkReadiness[]> {
    const networks = await this.ipfs.getNetworks();
    const networkIdsToCheck = new Set(networkIds);

    return networks
      .filter((network) => networkIdsToCheck.has(network.getId()))
      .map((network) => {
        const peerCount = new Set(network.getPeers()).size;

        return {
          networkId: network.getId(),
          peerCount,
          ready: peerCount > 0,
        };
      });
  }

  private async waitForPeerDiscovery(
    networkIds: string[],
  ): Promise<NodeStartupNetworkReadiness[]> {
    const timeoutMs = this.getPeerWaitTimeoutMs();
    const deadline = Date.now() + timeoutMs;
    let networkReadiness = await this.getNetworkReadiness(networkIds);

    while (
      networkReadiness.some((network) => !network.ready) &&
      Date.now() < deadline
    ) {
      await this.sleep(500);
      networkReadiness = await this.getNetworkReadiness(networkIds);
    }

    return networkReadiness;
  }

  public async inspect(
    networkIds: string[],
  ): Promise<NodeStartupNetworkReadiness[]> {
    return this.getNetworkReadiness(networkIds);
  }

  public async prepare(
    networkIds: string[],
  ): Promise<NodeStartupNetworkReadiness[]> {
    await this.heartbeatSender.send();

    return this.waitForPeerDiscovery(networkIds);
  }
}
