import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import IPFS from '../../../shared/infrastructure/ipfs/IPFS';
import { NodeHeartbeatWasSent } from '../../domain/events/NodeHeartbeatWasSent';
import { NodeRepository } from '../../domain/repositories/NodeRepository';

export default class NodeHeartbeatSender {
  constructor(
    private readonly nodeRepository: NodeRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly ipfs?: IPFS,
  ) {}

  private async getIPFSNetworkMetadata(): Promise<
    Map<string, { multiaddrs: string[]; peerId: string }>
  > {
    const metadata = new Map<
      string,
      { multiaddrs: string[]; peerId: string }
    >();

    if (!this.ipfs) {
      return metadata;
    }

    const networks = await this.ipfs.getNetworks();

    for (const network of networks) {
      metadata.set(network.getId(), {
        multiaddrs: network.getMultiaddrs(),
        peerId: network.getPeerId(),
      });
    }

    return metadata;
  }

  public async send(): Promise<void> {
    const node = await this.nodeRepository.loadLocalNode();
    const primitives = node.toPrimitives();
    const ipfsNetworkMetadata = await this.getIPFSNetworkMetadata();
    const networks = Object.values(primitives.networks).map((network) => {
      const metadata = ipfsNetworkMetadata.get(network.id);

      return {
        id: network.id,
        name: network.name,
        ...(metadata
          ? { multiaddrs: metadata.multiaddrs, peerId: metadata.peerId }
          : {}),
      };
    });

    await this.eventPublisher.publish([
      new NodeHeartbeatWasSent(primitives.id, {
        networks,
        owner: primitives.owner,
      }),
    ]);
  }
}
