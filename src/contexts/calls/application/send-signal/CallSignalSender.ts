import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';

import { Call } from '../../domain/Call';
import { CallNotFoundError } from '../../domain/errors/CallNotFoundError';
import CallRepository from '../../domain/repositories/CallRepository';
import { CallSignalSendMessage } from './messages/CallSignalSendMessage';

export default class CallSignalSender {
  constructor(
    private readonly repository: CallRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async send(
    message: CallSignalSendMessage,
    onCallFound?: () => Promise<void>,
  ): Promise<Call> {
    const call = await this.repository.findById(message.callId);

    if (!call) {
      throw new CallNotFoundError();
    }

    await onCallFound?.();

    call.sendSignal(
      message.senderIdentityId,
      message.recipientIdentityId,
      message.signalType,
      message.payload,
    );

    await this.eventPublisher.publish(call.pullDomainEvents());

    return call;
  }
}
