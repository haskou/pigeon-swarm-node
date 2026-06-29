import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Call } from '../../domain/Call';
import { CallNotFoundError } from '../../domain/errors/CallNotFoundError';
import CallRepository from '../../domain/repositories/CallRepository';
import { CallJoinMessage } from './messages/CallJoinMessage';

export default class CallJoiner {
  constructor(
    private readonly repository: CallRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async join(message: CallJoinMessage): Promise<Call> {
    const call = await this.repository.findById(message.callId);

    if (!call) {
      throw new CallNotFoundError();
    }

    call.join(message.participantIdentityId);

    await this.repository.save(call);
    await this.eventPublisher.publish(call.pullDomainEvents());

    return call;
  }
}
