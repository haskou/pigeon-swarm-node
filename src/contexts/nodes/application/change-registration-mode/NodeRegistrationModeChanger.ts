import { LocalDomainEventPublisher } from '@app/shared/infrastructure/messageBus/LocalDomainEventPublisher';

import { Node } from '../../domain/Node';
import NodeRepository from '../../domain/repositories/NodeRepository';
import { NodeRegistrationModeChangerMessage } from './messages/NodeRegistrationModeChangerMessage';

export default class NodeRegistrationModeChanger {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly eventPublisher: LocalDomainEventPublisher,
  ) {}

  public async change(
    message: NodeRegistrationModeChangerMessage,
  ): Promise<Node> {
    const node = await this.nodes.updateLocalNode((latest) =>
      latest.changeRegistrationMode(message.registrationMode),
    );

    // The mode is local node configuration: never gossiped nor pushed to clients.
    await this.eventPublisher.publishLocally(node.pullDomainEvents());

    return node;
  }
}
