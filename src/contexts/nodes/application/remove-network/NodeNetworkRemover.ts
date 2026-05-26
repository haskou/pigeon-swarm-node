import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import NodeLoaderService from '../../domain/services/NodeLoaderService';
import { NodeNetworkDataCleaner } from '../../domain/services/NodeNetworkDataCleaner';
import NodeSaverService from '../../domain/services/NodeSaverService';
import { NodeNetworkRemoverMessage } from './messages/NodeNetworkRemoverMessage';

export default class NodeNetworkRemover {
  constructor(
    private readonly loader: NodeLoaderService,
    private readonly saver: NodeSaverService,
    private readonly cleaner: NodeNetworkDataCleaner,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async remove(message: NodeNetworkRemoverMessage): Promise<void> {
    const node = await this.loader.loadNode();

    node.removeNetwork(message.networkId);

    await this.saver.saveNode(node);
    await this.cleaner.clean(message.networkId);
    await this.eventPublisher.publish(node.pullDomainEvents());
  }
}
