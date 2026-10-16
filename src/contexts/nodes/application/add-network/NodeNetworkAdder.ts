import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Node } from '../../domain/Node';
import NodeRepository from '../../domain/repositories/NodeRepository';
import { NodeNetworkAdderMessage } from './messages/NodeNetworkAdderMessage';
import { NodePublicNetworkAdderMessage } from './messages/NodePublicNetworkAdderMessage';

export default class NodeNetworkAdder {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  private async saveNetwork(
    message: NodeNetworkAdderMessage | NodePublicNetworkAdderMessage,
  ): Promise<Node> {
    const node = await this.nodes.updateLocalNode((latest) =>
      latest.addNetwork(message.network),
    );

    await this.eventPublisher.publish(node.pullDomainEvents());

    return node;
  }

  public async addNetwork(message: NodeNetworkAdderMessage): Promise<Node> {
    return this.saveNetwork(message);
  }

  public async addPublicNetwork(
    message: NodePublicNetworkAdderMessage,
  ): Promise<Node> {
    return this.saveNetwork(message);
  }
}
