import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';
import { Timestamp } from '@haskou/value-objects';

import IdentityPresenceRepository from '../../domain/repositories/IdentityPresenceRepository';
import IdentityPresenceNetworkResolver from '../IdentityPresenceNetworkResolver';

export default class IdentityPresenceExpirationRegistrar {
  private static readonly HEARTBEAT_TIMEOUT_MS = 20_000;

  constructor(
    private readonly repository: IdentityPresenceRepository,
    private readonly networkResolver: IdentityPresenceNetworkResolver,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async expire(): Promise<void> {
    const now = Timestamp.now();
    const threshold = new Timestamp(
      now.valueOf() - IdentityPresenceExpirationRegistrar.HEARTBEAT_TIMEOUT_MS,
    );
    const presences = await this.repository.findPotentiallyExpired(threshold);

    for (const presence of presences) {
      const networkIds = await this.networkResolver.resolve(
        presence.getIdentityId(),
      );
      const changed = presence.refreshDerivedStatus(networkIds, now);

      if (!changed) {
        continue;
      }

      await this.repository.save(presence, networkIds);
      await this.eventPublisher.publish(presence.pullDomainEvents());
    }
  }
}
