import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Call } from '../../domain/Call';
import CallRepository from '../../domain/repositories/CallRepository';
import CallAccessAuthorizer from '../authorize-call/CallAccessAuthorizer';
import CallParticipantLeaseRenewer from '../renew-participant-lease/CallParticipantLeaseRenewer';
import { CallJoinMessage } from './messages/CallJoinMessage';

export default class CallJoiner {
  constructor(
    private readonly repository: CallRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly leaseRenewer: CallParticipantLeaseRenewer,
    private readonly accessAuthorizer: CallAccessAuthorizer,
  ) {}

  /**
   * `onRecordAccepted` runs once the call accepts the join, right before it is
   * stored; a rejection stores nothing.
   */
  public async join(
    message: CallJoinMessage,
    onRecordAccepted?: () => Promise<void>,
  ): Promise<Call> {
    const call = await this.repository.requireById(message.callId);

    await this.accessAuthorizer.assertAccess(
      call,
      message.participantIdentityId,
    );

    if (call.getScope().isCommunityChannel()) {
      call.joinOrAdd(message.participantIdentityId, message.at);
    } else {
      call.join(message.participantIdentityId, message.at);
    }

    await onRecordAccepted?.();
    await this.repository.saveParticipant(
      call,
      message.participantIdentityId,
      message.at,
      message.getProof(),
    );
    const lease = await this.leaseRenewer.renew(
      call,
      message.participantIdentityId,
    );
    await this.eventPublisher.publish([
      ...call.pullDomainEvents(),
      ...lease.pullDomainEvents(),
    ]);

    return call;
  }
}
