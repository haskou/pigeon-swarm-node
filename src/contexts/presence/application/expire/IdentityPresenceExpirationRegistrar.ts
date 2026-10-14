import LocalRealtimeEventPublisher from '@app/shared/infrastructure/websocket/LocalRealtimeEventPublisher';
import { Timestamp } from '@haskou/value-objects';

import IdentityPresenceRepository from '../../domain/repositories/IdentityPresenceRepository';

export default class IdentityPresenceExpirationRegistrar {
  private static readonly HEARTBEAT_TIMEOUT_MS = 20_000;

  constructor(
    private readonly repository: IdentityPresenceRepository,
    private readonly localPublisher: LocalRealtimeEventPublisher,
  ) {}

  public async expire(): Promise<void> {
    const now = Timestamp.now();
    const threshold = new Timestamp(
      now.valueOf() - IdentityPresenceExpirationRegistrar.HEARTBEAT_TIMEOUT_MS,
    );
    const presences = await this.repository.findPotentiallyExpired(threshold);

    for (const presence of presences) {
      if (!presence.refreshDerivedStatus(now)) {
        continue;
      }

      await this.repository.save(presence);
      this.localPublisher.publish(presence.pullDomainEvents());
    }
  }
}
