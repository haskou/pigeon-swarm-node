import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';

import CallSignalDeliveryRepository from '../../domain/repositories/CallSignalDeliveryRepository';
import { CallSignalAcknowledgeMessage } from './messages/CallSignalAcknowledgeMessage';

export default class CallSignalAcknowledger {
  constructor(
    private readonly repository: CallSignalDeliveryRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async acknowledge(
    message: CallSignalAcknowledgeMessage,
  ): Promise<void> {
    const delivery = await this.repository.findById(message.signalId);

    if (!delivery) {
      return;
    }

    if (!delivery.acknowledge(message.recipientIdentityId, Timestamp.now())) {
      return;
    }

    await this.repository.save(delivery);
    await this.eventPublisher.publish(delivery.pullDomainEvents());
  }
}
