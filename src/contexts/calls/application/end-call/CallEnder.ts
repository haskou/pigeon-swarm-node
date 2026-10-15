import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Call } from '../../domain/Call';
import { CallParticipantNotFoundError } from '../../domain/errors/CallParticipantNotFoundError';
import CallRepository from '../../domain/repositories/CallRepository';
import CallAccessAuthorizer from '../authorize-call/CallAccessAuthorizer';
import { CallEndMessage } from './messages/CallEndMessage';

export default class CallEnder {
  constructor(
    private readonly repository: CallRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly accessAuthorizer: CallAccessAuthorizer,
  ) {}

  /**
   * `onRecordAccepted` runs once the call accepts the end, right before it is
   * stored; a rejection stores nothing.
   */
  public async end(
    message: CallEndMessage,
    onRecordAccepted?: () => Promise<void>,
  ): Promise<Call> {
    const call = await this.repository.requireById(message.callId);

    await this.accessAuthorizer.assertAccess(
      call,
      message.participantIdentityId,
      message.capability,
    );

    try {
      call.end(message.participantIdentityId, message.at);
    } catch (error) {
      if (error instanceof CallParticipantNotFoundError) {
        await this.repository.assertParticipantSettled(
          call.getId(),
          message.participantIdentityId,
        );
      }
      throw error;
    }

    await onRecordAccepted?.();
    await this.repository.saveEnd(call, message.getProof());
    await this.eventPublisher.publish(call.pullDomainEvents());

    return call;
  }
}
