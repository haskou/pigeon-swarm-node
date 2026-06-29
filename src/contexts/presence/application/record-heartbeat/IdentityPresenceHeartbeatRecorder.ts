import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';

import { IdentityPresence } from '../../domain/IdentityPresence';
import IdentityPresenceRepository from '../../domain/repositories/IdentityPresenceRepository';
import IdentityPresenceNetworkResolver from '../resolve-network/IdentityPresenceNetworkResolver';
import { IdentityPresenceHeartbeatMessage } from './messages/IdentityPresenceHeartbeatMessage';

export default class IdentityPresenceHeartbeatRecorder {
  constructor(
    private readonly repository: IdentityPresenceRepository,
    private readonly networkResolver: IdentityPresenceNetworkResolver,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async record(
    message: IdentityPresenceHeartbeatMessage,
  ): Promise<IdentityPresence> {
    const identityId = message.getIdentityId();
    const presence =
      (await this.repository.findByIdentityId(identityId)) ||
      IdentityPresence.disconnected(identityId);
    const networkIds = await this.networkResolver.resolve(identityId);

    presence.recordHeartbeat(message.activityDetected, networkIds);
    await this.repository.save(presence, networkIds);
    await this.eventPublisher.publish(presence.pullDomainEvents());

    return presence;
  }
}
