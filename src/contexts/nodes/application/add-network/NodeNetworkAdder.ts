import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import NodeLoaderService from '../../domain/services/NodeLoaderService';
import { NodeSaverService } from '../../domain/services/NodeSaverService';
import { NodeNetworkAdderMessage } from './messages/NodeNetworkAdderMessage';

export class NodeNetworkAdder {
  constructor(
    private readonly loader: NodeLoaderService,
    private readonly saver: NodeSaverService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async addNetwork(message: NodeNetworkAdderMessage): Promise<void> {
    const node = await this.loader.loadNode();
    node.addNetwork(message.network);

    await this.saver.saveNode(node);
    await this.eventPublisher.publish(node.pullDomainEvents());
  }
}
