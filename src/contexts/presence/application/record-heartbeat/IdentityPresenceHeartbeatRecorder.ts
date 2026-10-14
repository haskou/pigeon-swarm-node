import LocalRealtimeEventPublisher from '@app/shared/infrastructure/websocket/LocalRealtimeEventPublisher';

import { IdentityPresence } from '../../domain/IdentityPresence';
import IdentityPresenceRepository from '../../domain/repositories/IdentityPresenceRepository';
import { IdentityPresenceHeartbeatMessage } from './messages/IdentityPresenceHeartbeatMessage';

export default class IdentityPresenceHeartbeatRecorder {
  constructor(
    private readonly repository: IdentityPresenceRepository,
    private readonly localPublisher: LocalRealtimeEventPublisher,
  ) {}

  public async record(
    message: IdentityPresenceHeartbeatMessage,
  ): Promise<IdentityPresence> {
    const identityId = message.getIdentityId();
    const hasPresence = await this.repository.hasByIdentityId(identityId);
    const presence = hasPresence
      ? await this.repository.requireByIdentityId(identityId)
      : IdentityPresence.disconnected(identityId);

    presence.recordHeartbeat(message.activityDetected);
    await this.repository.save(presence);
    const events = presence.pullDomainEvents();

    if (events.length > 0) {
      this.localPublisher.publish(events);
    }

    return presence;
  }
}
