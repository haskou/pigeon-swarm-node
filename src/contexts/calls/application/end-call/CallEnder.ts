import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Call } from '../../domain/Call';
import { CallNotFoundError } from '../../domain/errors/CallNotFoundError';
import CallRepository from '../../domain/repositories/CallRepository';
import CallAccessAuthorizer from '../authorize-call/CallAccessAuthorizer';
import { CallEndMessage } from './messages/CallEndMessage';

export default class CallEnder {
  constructor(
    private readonly repository: CallRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly accessAuthorizer: CallAccessAuthorizer,
  ) {}

  public async end(message: CallEndMessage): Promise<Call> {
    const call = await this.repository.findById(message.callId);

    if (!call) {
      throw new CallNotFoundError();
    }

    await this.accessAuthorizer.assertAccess(
      call,
      message.participantIdentityId,
    );

    call.end(message.participantIdentityId);

    await this.repository.save(call);
    await this.eventPublisher.publish(call.pullDomainEvents());

    return call;
  }
}
