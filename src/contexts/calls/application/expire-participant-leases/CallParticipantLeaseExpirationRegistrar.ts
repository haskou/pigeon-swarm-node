import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';

import CallParticipantLeaseRepository from '../../domain/repositories/CallParticipantLeaseRepository';

export default class CallParticipantLeaseExpirationRegistrar {
  private static readonly HEARTBEAT_TIMEOUT_MS = 5_000;
  private static readonly DISCONNECTED_RETENTION_MS = 60_000;

  constructor(
    private readonly repository: CallParticipantLeaseRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly nodeRepository: NodeRepository,
  ) {}

  public async expire(): Promise<void> {
    const now = Timestamp.now();
    const threshold = new Timestamp(
      now.valueOf() -
        CallParticipantLeaseExpirationRegistrar.HEARTBEAT_TIMEOUT_MS,
    );
    const leases = await this.repository.findPotentiallyExpired(threshold);
    const localNodeId = await this.nodeRepository.loadLocalNodeId();

    for (const lease of leases) {
      if (!lease.disconnect(now)) {
        continue;
      }

      await this.repository.save(lease);

      if (lease.belongsToNode(localNodeId)) {
        await this.eventPublisher.publish(lease.pullDomainEvents());
      } else {
        lease.pullDomainEvents();
      }
    }

    await this.repository.purgeDisconnectedBefore(
      new Timestamp(
        now.valueOf() -
          CallParticipantLeaseExpirationRegistrar.DISCONNECTED_RETENTION_MS,
      ),
    );
  }
}
