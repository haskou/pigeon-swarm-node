import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { Call } from '../../domain/Call';
import { CallNotFoundError } from '../../domain/errors/CallNotFoundError';
import CallRepository from '../../domain/repositories/CallRepository';
import { CallLeaveMessage } from './messages/CallLeaveMessage';

export class CallLeaver {
  constructor(
    private readonly repository: CallRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async leave(message: CallLeaveMessage): Promise<Call> {
    const call = await this.repository.findById(message.callId);

    if (!call) {
      throw new CallNotFoundError();
    }

    call.leave(message.participantIdentityId);

    await this.repository.save(call);
    await this.eventPublisher.publish(call.pullDomainEvents());

    return call;
  }
}
