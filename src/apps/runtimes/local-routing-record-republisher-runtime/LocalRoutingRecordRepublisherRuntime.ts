import IpfsIdentityRouting from '@app/contexts/identities/infrastructure/ipfs/IpfsIdentityRouting';
import IpfsKeychainRouting from '@app/contexts/keychains/infrastructure/ipfs/IpfsKeychainRouting';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { Runtime } from '@app/shared/infrastructure/lifecycle/Runtime';
import Kernel from '@haskou/ddd-kernel';

export default class LocalRoutingRecordRepublisherRuntime implements Runtime {
  private readonly registeredNetworkIds = new Set<string>();
  private readonly republishingNetworkIds = new Set<string>();

  public constructor(
    private readonly networkRegistry: IPFSNetworkRegistry,
    private readonly identityRouting: IpfsIdentityRouting,
    private readonly keychainRouting: IpfsKeychainRouting,
  ) {}

  private shouldRepublishForPeerConnection(network: IPFSNetwork): boolean {
    return network.getPeers().length <= 1;
  }

  private async republish(network: IPFSNetwork, peerId: string): Promise<void> {
    const networkId = network.getId();

    if (this.republishingNetworkIds.has(networkId)) {
      return;
    }

    this.republishingNetworkIds.add(networkId);

    try {
      const [identities, keychains] = await Promise.all([
        this.identityRouting.republish(networkId),
        this.keychainRouting.republish(networkId),
      ]);

      Kernel.logger.debug?.(
        `Republished local routing records after peer connection:` +
          ` networkId=${networkId}` +
          ` peerId=${peerId}` +
          ` identities=${identities}` +
          ` keychains=${keychains}` +
          ` messages=0`,
      );
    } catch (error: unknown) {
      Kernel.logger.warn(
        `Local routing record republish after peer connection failed:` +
          ` networkId=${networkId}` +
          ` peerId=${peerId}` +
          ` error=${String(error)}`,
      );
    } finally {
      this.republishingNetworkIds.delete(networkId);
    }
  }

  private registerNetwork(network: IPFSNetwork): void {
    const networkId = network.getId();

    if (this.registeredNetworkIds.has(networkId)) {
      return;
    }

    this.registeredNetworkIds.add(networkId);

    if (!network.isPrivate()) {
      return;
    }

    network.onPeerConnected((peerId) => {
      if (!this.shouldRepublishForPeerConnection(network)) {
        return;
      }

      void this.republish(network, peerId);
    });
  }

  public run(): Promise<void> {
    this.networkRegistry
      .getAll()
      .forEach((network) => this.registerNetwork(network));
    this.networkRegistry.onNetworkRegistered((network) =>
      this.registerNetwork(network),
    );
    this.networkRegistry.onNetworkRemoved((networkId) => {
      this.registeredNetworkIds.delete(networkId);
      this.republishingNetworkIds.delete(networkId);
    });

    return Promise.resolve();
  }
}
