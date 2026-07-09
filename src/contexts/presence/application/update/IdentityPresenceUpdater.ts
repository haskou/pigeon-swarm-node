import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { IdentityPresence } from '../../domain/IdentityPresence';
import IdentityPresenceRepository from '../../domain/repositories/IdentityPresenceRepository';
import IdentityPresenceNetworkResolver from '../resolve-network/IdentityPresenceNetworkResolver';
import { IdentityPresenceUpdateMessage } from './messages/IdentityPresenceUpdateMessage';

export default class IdentityPresenceUpdater {
  constructor(
    private readonly repository: IdentityPresenceRepository,
    private readonly networkResolver: IdentityPresenceNetworkResolver,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly nodeRepository: NodeRepository,
  ) {}

  public async clearCustomMessage(
    message: IdentityPresenceUpdateMessage,
  ): Promise<IdentityPresence> {
    const identityId = message.getIdentityId();
    const nodeId = await this.nodeRepository.loadLocalNodeId();
    const presence =
      (await this.repository.findByIdentityIdAndNodeId(identityId, nodeId)) ||
      IdentityPresence.disconnected(identityId, nodeId);
    const networkIds = await this.networkResolver.resolve(identityId);

    presence.clearCustomMessage(networkIds);
    await this.repository.save(presence, networkIds);
    await this.eventPublisher.publish(presence.pullDomainEvents());

    return presence;
  }

  public async update(
    message: IdentityPresenceUpdateMessage,
  ): Promise<IdentityPresence> {
    const identityId = message.getIdentityId();
    const nodeId = await this.nodeRepository.loadLocalNodeId();
    const presence =
      (await this.repository.findByIdentityIdAndNodeId(identityId, nodeId)) ||
      IdentityPresence.disconnected(identityId, nodeId);
    const networkIds = await this.networkResolver.resolve(identityId);

    presence.update(
      message.getStatus(),
      message.getCustomMessage(),
      message.hasCustomMessage(),
      networkIds,
    );
    await this.repository.save(presence, networkIds);
    await this.eventPublisher.publish(presence.pullDomainEvents());

    return presence;
  }
}
