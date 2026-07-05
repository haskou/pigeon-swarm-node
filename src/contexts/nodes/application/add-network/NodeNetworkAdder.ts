import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Node } from '../../domain/Node';
import NodeLoaderService from '../../domain/services/NodeLoaderService';
import NodeSaverService from '../../domain/services/NodeSaverService';
import { NodeNetworkAdderMessage } from './messages/NodeNetworkAdderMessage';
import { NodePublicNetworkAdderMessage } from './messages/NodePublicNetworkAdderMessage';

export default class NodeNetworkAdder {
  constructor(
    private readonly loader: NodeLoaderService,
    private readonly saver: NodeSaverService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  private async saveNetwork(
    message: NodeNetworkAdderMessage | NodePublicNetworkAdderMessage,
  ): Promise<Node> {
    const node = await this.loader.loadNode();
    node.addNetwork(message.network);

    await this.saver.saveNode(node);
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
