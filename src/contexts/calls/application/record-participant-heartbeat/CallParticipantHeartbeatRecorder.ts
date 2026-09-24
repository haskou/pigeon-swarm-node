import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Call } from '../../domain/Call';
import { CallNotFoundError } from '../../domain/errors/CallNotFoundError';
import CallRepository from '../../domain/repositories/CallRepository';
import CallAccessAuthorizer from '../authorize-call/CallAccessAuthorizer';
import CallParticipantLeaseRenewer from '../renew-participant-lease/CallParticipantLeaseRenewer';
import { CallParticipantHeartbeatRecordMessage } from './messages/CallParticipantHeartbeatRecordMessage';

export default class CallParticipantHeartbeatRecorder {
  constructor(
    private readonly callRepository: CallRepository,
    private readonly leaseRenewer: CallParticipantLeaseRenewer,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly accessAuthorizer: CallAccessAuthorizer,
  ) {}

  public async record(
    message: CallParticipantHeartbeatRecordMessage,
  ): Promise<Call> {
    const call = await this.callRepository.findById(message.callId);

    if (!call || !call.isActive()) {
      throw new CallNotFoundError();
    }

    await this.accessAuthorizer.assertAccess(
      call,
      message.participantIdentityId,
    );

    if (
      call.getScope().isCommunityChannel() &&
      !call.hasJoinedParticipant(message.participantIdentityId)
    ) {
      throw new CallNotFoundError();
    }
    call.assertParticipantCanHeartbeat(message.participantIdentityId);
    const lease = call.getScope().isCommunityChannel()
      ? await this.leaseRenewer.renewExisting(
          call,
          message.participantIdentityId,
          message.mediaConnections,
        )
      : await this.leaseRenewer.renew(
          call,
          message.participantIdentityId,
          message.mediaConnections,
        );
    await this.eventPublisher.publish(lease.pullDomainEvents());

    return call;
  }
}
