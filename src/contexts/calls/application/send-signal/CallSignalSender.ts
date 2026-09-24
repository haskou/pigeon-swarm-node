import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { CallSignalDelivery } from '../../domain/CallSignalDelivery';
import { CallNotFoundError } from '../../domain/errors/CallNotFoundError';
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
    const call = await this.repository.findById(message.callId);

    if (!call) {
      throw new CallNotFoundError();
    }

    await this.accessAuthorizer.assertAccess(call, message.senderIdentityId);

    await this.accessAuthorizer.assertAccess(call, message.recipientIdentityId);

    await onCallFound?.();

    const delivery = call.sendSignal(
      CallSignalId.generate(),
      await this.nodeRepository.loadLocalNodeId(),
      message.senderIdentityId,
      message.recipientIdentityId,
      message.signalType,
      message.payload,
    );

    await this.deliveryRepository.save(delivery);
    await this.eventPublisher.publish(delivery.pullDomainEvents());

    return delivery;
  }
}
