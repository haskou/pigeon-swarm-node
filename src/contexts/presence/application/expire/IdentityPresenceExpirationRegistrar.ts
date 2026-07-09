import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';

import IdentityPresenceRepository from '../../domain/repositories/IdentityPresenceRepository';
import IdentityPresenceNetworkResolver from '../resolve-network/IdentityPresenceNetworkResolver';

export default class IdentityPresenceExpirationRegistrar {
  private static readonly HEARTBEAT_TIMEOUT_MS = 20_000;

  constructor(
    private readonly repository: IdentityPresenceRepository,
    private readonly networkResolver: IdentityPresenceNetworkResolver,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly nodeRepository: NodeRepository,
  ) {}

  public async expire(): Promise<void> {
    const now = Timestamp.now();
    const threshold = new Timestamp(
      now.valueOf() - IdentityPresenceExpirationRegistrar.HEARTBEAT_TIMEOUT_MS,
    );
    const presences = await this.repository.findPotentiallyExpired(threshold);
    const localNodeId = await this.nodeRepository.loadLocalNodeId();

    for (const presence of presences) {
      const networkIds = await this.networkResolver.resolve(
        presence.getIdentityId(),
      );
      const changed = presence.refreshDerivedStatus(networkIds, now);

      if (!changed) {
        continue;
      }

      await this.repository.save(presence, networkIds);

      if (presence.belongsToNode(localNodeId)) {
        await this.eventPublisher.publish(presence.pullDomainEvents());
      } else {
        presence.pullDomainEvents();
      }
    }
  }
}
