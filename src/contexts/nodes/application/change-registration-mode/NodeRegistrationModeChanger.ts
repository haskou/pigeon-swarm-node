import { LocalDomainEventPublisher } from '@app/shared/infrastructure/messageBus/LocalDomainEventPublisher';

import { Node } from '../../domain/Node';
import NodeLoaderService from '../../domain/services/NodeLoaderService';
import NodeSaverService from '../../domain/services/NodeSaverService';
import { NodeRegistrationModeChangerMessage } from './messages/NodeRegistrationModeChangerMessage';

export default class NodeRegistrationModeChanger {
  constructor(
    private readonly loader: NodeLoaderService,
    private readonly saver: NodeSaverService,
    private readonly eventPublisher: LocalDomainEventPublisher,
  ) {}

  public async change(
    message: NodeRegistrationModeChangerMessage,
  ): Promise<Node> {
    const node = await this.loader.loadNode();

    node.changeRegistrationMode(message.registrationMode);

    await this.saver.saveNode(node);
    // The mode is local node configuration: never gossiped nor pushed to clients.
    await this.eventPublisher.publishLocally(node.pullDomainEvents());

    return node;
  }
}
