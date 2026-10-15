import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Node } from '../../domain/Node';
import NodeLoaderService from '../../domain/services/NodeLoaderService';
import NodeSaverService from '../../domain/services/NodeSaverService';
import { NodeRegistrationModeChangerMessage } from './messages/NodeRegistrationModeChangerMessage';

export default class NodeRegistrationModeChanger {
  constructor(
    private readonly loader: NodeLoaderService,
    private readonly saver: NodeSaverService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async change(
    message: NodeRegistrationModeChangerMessage,
  ): Promise<Node> {
    const node = await this.loader.loadNode();

    node.changeRegistrationMode(message.registrationMode);

    await this.saver.saveNode(node);
    await this.eventPublisher.publish(node.pullDomainEvents());

    return node;
  }
}
