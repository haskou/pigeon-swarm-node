import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { CallSignalDelivery } from '../../domain/CallSignalDelivery';
import { CallParticipantNotFoundError } from '../../domain/errors/CallParticipantNotFoundError';
import CallRepository from '../../domain/repositories/CallRepository';
import CallSignalDeliveryRepository from '../../domain/repositories/CallSignalDeliveryRepository';
import { CallSignalId } from '../../domain/value-objects/CallSignalId';
import CallAccessAuthorizer from '../authorize-call/CallAccessAuthorizer';
import { CallSignalSendMessage } from './messages/CallSignalSendMessage';

export default class CallSignalSender {
  constructor(
    private readonly repository: CallRepository,
    private readonly deliveryRepository: CallSignalDeliveryRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly nodeRepository: NodeRepository,
    private readonly accessAuthorizer: CallAccessAuthorizer,
  ) {}

  public async send(
    message: CallSignalSendMessage,
    onCallFound?: () => Promise<void>,
  ): Promise<CallSignalDelivery> {
    const call = await this.repository.requireById(message.callId);

    await this.accessAuthorizer.assertAccess(call, message.senderIdentityId);

    await this.accessAuthorizer.assertAccess(call, message.recipientIdentityId);

    await onCallFound?.();

    const localNodeId = await this.nodeRepository.loadLocalNodeId();
    let delivery: CallSignalDelivery;

    try {
      delivery = call.sendSignal(
        CallSignalId.generate(),
        localNodeId,
        message.senderIdentityId,
        message.recipientIdentityId,
        message.signalType,
        message.payload,
      );
    } catch (error) {
      if (error instanceof CallParticipantNotFoundError) {
        await this.repository.assertParticipantSettled(
          call.getId(),
          message.senderIdentityId,
        );
        await this.repository.assertParticipantSettled(
          call.getId(),
          message.recipientIdentityId,
        );
      }
      throw error;
    }

    await this.deliveryRepository.save(delivery);
    await this.eventPublisher.publish(delivery.pullDomainEvents());

    return delivery;
  }
}
