import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';

import CallSignalDeliveryRepository from '../../domain/repositories/CallSignalDeliveryRepository';

export default class CallSignalDeliveryRetrier {
  constructor(
    private readonly repository: CallSignalDeliveryRepository,
    private readonly nodeRepository: NodeRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async retry(now: Timestamp = Timestamp.now()): Promise<void> {
    const ownerNodeId = await this.nodeRepository.loadLocalNodeId();
    const deliveries = await this.repository.findRetryableOwnedBy(
      ownerNodeId,
      now,
    );

    for (const delivery of deliveries) {
      if (!delivery.retry(now)) {
        continue;
      }

      await this.repository.save(delivery);
      await this.eventPublisher.publish(delivery.pullDomainEvents());
    }
  }
}
