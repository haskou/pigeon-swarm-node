import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';

import { CallSignalDelivery } from '../../domain/CallSignalDelivery';
import { CallParticipantNotFoundError } from '../../domain/errors/CallParticipantNotFoundError';
import { CallSignalAlreadySentError } from '../../domain/errors/CallSignalAlreadySentError';
import CallRepository from '../../domain/repositories/CallRepository';
import CallSignalDeliveryRepository from '../../domain/repositories/CallSignalDeliveryRepository';
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
    const { signal } = message;

    await this.accessAuthorizer.assertAccess(
      call,
      message.senderIdentityId,
      message.capability,
    );

    await this.accessAuthorizer.assertAccess(
      call,
      signal.getRecipientIdentityId(),
    );

    call.assertCanCarrySignal(signal);
    signal.assertFreshAt(Timestamp.now());

    if (await this.deliveryRepository.hasById(signal.getId())) {
      throw new CallSignalAlreadySentError();
    }

    await onCallFound?.();

    const localNodeId = await this.nodeRepository.loadLocalNodeId();
    let delivery: CallSignalDelivery;

    try {
      delivery = call.sendSignal(signal, localNodeId);
    } catch (error) {
      if (error instanceof CallParticipantNotFoundError) {
        await this.repository.assertParticipantSettled(
          call.getId(),
          message.senderIdentityId,
        );
        await this.repository.assertParticipantSettled(
          call.getId(),
          signal.getRecipientIdentityId(),
        );
      }
      throw error;
    }

    await this.deliveryRepository.save(delivery);
    await this.eventPublisher.publish(delivery.pullDomainEvents());

    return delivery;
  }
}
