import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

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
  ): Promise<void> {
    const node = await this.loader.loadNode();
    node.addNetwork(message.network);

    await this.saver.saveNode(node);
    await this.eventPublisher.publish(node.pullDomainEvents());
  }

  public async addNetwork(message: NodeNetworkAdderMessage): Promise<void> {
    await this.saveNetwork(message);
  }

  public async addPublicNetwork(
    message: NodePublicNetworkAdderMessage,
  ): Promise<void> {
    await this.saveNetwork(message);
  }
}
