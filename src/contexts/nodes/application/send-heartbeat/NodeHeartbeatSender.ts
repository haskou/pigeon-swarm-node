import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { NodeHeartbeatWasSent } from '../../domain/events/NodeHeartbeatWasSent';
import NodeRepository from '../../domain/repositories/NodeRepository';
import { NodePeerNetworkType } from '../../domain/value-objects/NodePeerNetworkType';

export default class NodeHeartbeatSender {
  constructor(
    private readonly nodeRepository: NodeRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async send(): Promise<void> {
    const node = await this.nodeRepository.loadLocalNode();
    const primitives = node.toPrimitives();
    const networks = Object.values(primitives.networks).map((network) => ({
      id: network.id,
      name: network.name,
      type: network.key
        ? NodePeerNetworkType.PRIVATE
        : NodePeerNetworkType.PUBLIC,
    }));

    await this.eventPublisher.publish([
      new NodeHeartbeatWasSent(primitives.id, {
        networks,
        owner: primitives.owner,
      }),
    ]);
  }
}
