import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';

import MongoIdentityPresenceRepository from '../../infrastructure/mongo/MongoIdentityPresenceRepository';
import IdentityPresenceNetworkResolver from '../IdentityPresenceNetworkResolver';

export default class IdentityPresenceExpirationRegistrar {
  private static readonly HEARTBEAT_TIMEOUT_MS = 10_000;

  constructor(
    private readonly repository: MongoIdentityPresenceRepository,
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

      await this.repository.save(presence);
      await this.eventPublisher.publish(presence.pullDomainEvents());
    }
  }
}
