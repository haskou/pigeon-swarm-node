import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import LocalRealtimeEventPublisher from '@app/shared/infrastructure/websocket/LocalRealtimeEventPublisher';

import { IdentityPresence } from '../../domain/IdentityPresence';
import IdentityPresenceRepository from '../../domain/repositories/IdentityPresenceRepository';
import { IdentityPresenceUpdateMessage } from './messages/IdentityPresenceUpdateMessage';

/**
 * Presence is a lease on the node serving the identity. Changes reach only
 * this node's realtime clients; they are never gossiped to other nodes.
 */
export default class IdentityPresenceUpdater {
  constructor(
    private readonly repository: IdentityPresenceRepository,
    private readonly localPublisher: LocalRealtimeEventPublisher,
  ) {}

  private async load(identityId: IdentityId): Promise<IdentityPresence> {
    const hasPresence = await this.repository.hasByIdentityId(identityId);
    const presence = hasPresence
      ? await this.repository.requireByIdentityId(identityId)
      : IdentityPresence.disconnected(identityId);

    return presence;
  }

  private async persist(presence: IdentityPresence): Promise<IdentityPresence> {
    await this.repository.save(presence);
    this.localPublisher.publish(presence.pullDomainEvents());

    return presence;
  }

  public async update(
    message: IdentityPresenceUpdateMessage,
  ): Promise<IdentityPresence> {
    const presence = await this.load(message.getIdentityId());

    presence.update(message.getStatus());

    return this.persist(presence);
  }
}
