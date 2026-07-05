import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import NodeLoaderService from '../../domain/services/NodeLoaderService';
import NodeSaverService from '../../domain/services/NodeSaverService';
import { NodeRelayConfigurationUpdaterMessage } from './messages/NodeRelayConfigurationUpdaterMessage';

export default class NodeRelayConfigurationUpdater {
  constructor(
    private readonly loader: NodeLoaderService,
    private readonly saver: NodeSaverService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async update(
    message: NodeRelayConfigurationUpdaterMessage,
  ): Promise<void> {
    const node = await this.loader.loadNode();

    node.updateRelayConfiguration(message.relayConfiguration);

    await this.saver.saveNode(node);
    await this.eventPublisher.publish(node.pullDomainEvents());
  }
}
