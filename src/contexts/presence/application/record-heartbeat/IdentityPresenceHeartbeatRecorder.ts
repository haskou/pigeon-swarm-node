import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { IdentityPresence } from '../../domain/IdentityPresence';
import MongoIdentityPresenceRepository from '../../infrastructure/mongo/MongoIdentityPresenceRepository';
import IdentityPresenceNetworkResolver from '../IdentityPresenceNetworkResolver';
import { IdentityPresenceHeartbeatMessage } from './messages/IdentityPresenceHeartbeatMessage';

export default class IdentityPresenceHeartbeatRecorder {
  constructor(
    private readonly repository: MongoIdentityPresenceRepository,
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
    await this.repository.save(presence);
    await this.eventPublisher.publish(presence.pullDomainEvents());

    return presence;
  }
}
