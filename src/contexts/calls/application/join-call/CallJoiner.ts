import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Call } from '../../domain/Call';
import { CallNotFoundError } from '../../domain/errors/CallNotFoundError';
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

  public async join(message: CallJoinMessage): Promise<Call> {
    const call = await this.repository.findById(message.callId);

    if (!call) {
      throw new CallNotFoundError();
    }

    await this.accessAuthorizer.assertAccess(
      call,
      message.participantIdentityId,
    );

    call.join(message.participantIdentityId);

    await this.repository.save(call);
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
