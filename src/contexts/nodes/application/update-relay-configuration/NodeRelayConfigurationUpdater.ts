import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import NodeRepository from '../../domain/repositories/NodeRepository';
import { NodeRelayConfigurationUpdaterMessage } from './messages/NodeRelayConfigurationUpdaterMessage';

export default class NodeRelayConfigurationUpdater {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async update(
    message: NodeRelayConfigurationUpdaterMessage,
  ): Promise<void> {
    const node = await this.nodes.updateLocalNode((latest) =>
      latest.updateRelayConfiguration(
        message.relayConfiguration,
        message.authenticatedIdentityId,
      ),
    );

    await this.eventPublisher.publish(node.pullDomainEvents());
  }
}
