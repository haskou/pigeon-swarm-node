import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import NodeRepository from '../../domain/repositories/NodeRepository';
import NodeNetworkDataCleaner from '../../domain/services/NodeNetworkDataCleaner';
import { NodeNetworkRemoverMessage } from './messages/NodeNetworkRemoverMessage';

export default class NodeNetworkRemover {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly cleaner: NodeNetworkDataCleaner,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async remove(message: NodeNetworkRemoverMessage): Promise<void> {
    const node = await this.nodes.updateLocalNode(async (latest) => {
      latest.removeNetwork(message.networkId, message.authenticatedIdentityId);
      await this.cleaner.clean(message.networkId);
    });

    await this.eventPublisher.publish(node.pullDomainEvents());
  }
}
