import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Node } from '../../domain/Node';
import NodeRepository from '../../domain/repositories/NodeRepository';
import { NodeNetworkAdderMessage } from './messages/NodeNetworkAdderMessage';

export default class NodeNetworkAdder {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async addNetwork(message: NodeNetworkAdderMessage): Promise<Node> {
    const node = await this.nodes.updateLocalNode((latest) =>
      latest.addNetwork(message.network, message.authenticatedIdentityId),
    );

    await this.eventPublisher.publish(node.pullDomainEvents());

    return node;
  }
}
