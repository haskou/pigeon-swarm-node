import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { IdentityPresence } from '../../domain/IdentityPresence';
import IdentityPresenceRepository from '../../domain/repositories/IdentityPresenceRepository';
import IdentityPresenceNetworkResolver from '../resolve-network/IdentityPresenceNetworkResolver';
import { IdentityPresenceHeartbeatMessage } from './messages/IdentityPresenceHeartbeatMessage';

export default class IdentityPresenceHeartbeatRecorder {
  constructor(
    private readonly repository: IdentityPresenceRepository,
    private readonly networkResolver: IdentityPresenceNetworkResolver,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly nodeRepository: NodeRepository,
  ) {}

  public async record(
    message: IdentityPresenceHeartbeatMessage,
  ): Promise<IdentityPresence> {
    const identityId = message.getIdentityId();
    const nodeId = await this.nodeRepository.loadLocalNodeId();
    const presence =
      (await this.repository.findByIdentityIdAndNodeId(identityId, nodeId)) ||
      IdentityPresence.disconnected(identityId, nodeId);
    const networkIds = await this.networkResolver.resolve(identityId);

    presence.recordHeartbeat(message.activityDetected, networkIds);
    await this.repository.save(presence, networkIds);
    const events = presence.pullDomainEvents();

    if (events.length > 0) {
      await this.eventPublisher.publish(events);
    }

    return presence;
  }
}
