import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Call } from '../../domain/Call';
import { CallNotFoundError } from '../../domain/errors/CallNotFoundError';
import CallRepository from '../../domain/repositories/CallRepository';
import CallParticipantLeaseReleaser from '../release-participant-lease/CallParticipantLeaseReleaser';
import { CallLeaveMessage } from './messages/CallLeaveMessage';

export default class CallLeaver {
  constructor(
    private readonly repository: CallRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly leaseReleaser: CallParticipantLeaseReleaser,
  ) {}

  public async leave(message: CallLeaveMessage): Promise<Call> {
    const call = await this.repository.findById(message.callId);

    if (!call) {
      throw new CallNotFoundError();
    }

    call.leave(message.participantIdentityId);

    await this.repository.save(call);
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
