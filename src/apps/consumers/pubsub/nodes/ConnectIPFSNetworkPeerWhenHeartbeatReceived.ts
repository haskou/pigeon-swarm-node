import { NodeHeartbeatWasSent } from '@app/contexts/nodes/domain/events/NodeHeartbeatWasSent';
import { IPFSNetworkNotFoundError } from '@app/contexts/shared/infrastructure/ipfs/errors/IPFSNetworkNotFoundError';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

type HeartbeatIPFSNetwork = {
  id: string;
  multiaddrs: string[];
  peerId?: string;
};

export default class ConnectIPFSPeerWhenHeartbeatReceived extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.connect-ipfs-network-peer-when-heartbeat-received';

  constructor(
    consumer: DomainEventConsumer,
    private readonly ipfs: IPFS,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return ConnectIPFSPeerWhenHeartbeatReceived.QUEUE_NAME;
  }

  public get eventName(): string {
    return NodeHeartbeatWasSent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return NodeHeartbeatWasSent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  private getNetworks(event: DomainEvent): HeartbeatIPFSNetwork[] {
    if (!Array.isArray(event.attributes.networks)) {
      return [];
    }

    return event.attributes.networks
      .filter(
        (network): network is HeartbeatIPFSNetwork =>
          typeof network === 'object' &&
          network !== null &&
          'id' in network &&
          Array.isArray(network.multiaddrs),
      )
      .map((network) => ({
        id: String(network.id),
        multiaddrs: network.multiaddrs.map(String),
        peerId: network.peerId ? String(network.peerId) : undefined,
      }));
  }

  public async handler(event: DomainEvent): Promise<void> {
    for (const heartbeatNetwork of this.getNetworks(event)) {
      try {
        const network = await this.ipfs.getNetwork(heartbeatNetwork.id);

        if (heartbeatNetwork.peerId === network.getPeerId()) {
          continue;
        }

        await network.connect(heartbeatNetwork.multiaddrs);
      } catch (error: unknown) {
        if (error instanceof IPFSNetworkNotFoundError) {
          continue;
        }

        throw error;
      }
    }
  }
}
