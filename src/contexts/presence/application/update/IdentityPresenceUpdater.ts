import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';

import { IdentityPresence } from '../../domain/IdentityPresence';
import IdentityPresenceRepository from '../../domain/repositories/IdentityPresenceRepository';
import IdentityPresenceNetworkResolver from '../resolve-network/IdentityPresenceNetworkResolver';
import { IdentityPresenceUpdateMessage } from './messages/IdentityPresenceUpdateMessage';

export default class IdentityPresenceUpdater {
  constructor(
    private readonly repository: IdentityPresenceRepository,
    private readonly networkResolver: IdentityPresenceNetworkResolver,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async clearCustomMessage(
    message: IdentityPresenceUpdateMessage,
  ): Promise<IdentityPresence> {
    const identityId = message.getIdentityId();
    const presence =
      (await this.repository.findByIdentityId(identityId)) ||
      IdentityPresence.disconnected(identityId);
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
    const presence =
      (await this.repository.findByIdentityId(identityId)) ||
      IdentityPresence.disconnected(identityId);
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
