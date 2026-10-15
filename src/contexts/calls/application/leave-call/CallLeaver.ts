import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Call } from '../../domain/Call';
import CallRepository from '../../domain/repositories/CallRepository';
import CallAccessAuthorizer from '../authorize-call/CallAccessAuthorizer';
import CallParticipantLeaseReleaser from '../release-participant-lease/CallParticipantLeaseReleaser';
import { CallLeaveMessage } from './messages/CallLeaveMessage';

export default class CallLeaver {
  constructor(
    private readonly repository: CallRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly leaseReleaser: CallParticipantLeaseReleaser,
    private readonly accessAuthorizer: CallAccessAuthorizer,
  ) {}

  /**
   * `onRecordAccepted` runs once the call accepts the leave, right before it
   * is stored; a rejection stores nothing.
   */
  public async leave(
    message: CallLeaveMessage,
    onRecordAccepted?: () => Promise<void>,
  ): Promise<Call> {
    const call = await this.repository.requireById(message.callId);

    await this.accessAuthorizer.assertAccess(
      call,
      message.participantIdentityId,
      message.capability,
    );

    call.leave(message.participantIdentityId, message.at);

    await onRecordAccepted?.();
    await this.repository.saveParticipant(
      call,
      message.participantIdentityId,
      message.at,
      message.getProof(),
    );
    const releasedLeases = await this.leaseReleaser.release(
      call,
      message.participantIdentityId,
    );
    await this.eventPublisher.publish([
      ...call.pullDomainEvents(),
      ...releasedLeases.flatMap((lease) => lease.pullDomainEvents()),
    ]);

    return call;
  }
}
