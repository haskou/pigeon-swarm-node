import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Call } from '../../domain/Call';
import CallRepository from '../../domain/repositories/CallRepository';
import CallParticipantLeaseRenewer from '../renew-participant-lease/CallParticipantLeaseRenewer';
import CallScopeResolver from './CallScopeResolver';
import { CallStartMessage } from './messages/CallStartMessage';

export default class CallStarter {
  constructor(
    private readonly repository: CallRepository,
    private readonly scopeResolver: CallScopeResolver,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly leaseRenewer: CallParticipantLeaseRenewer,
  ) {}

  private async findActiveCommunityChannelCall(
    message: CallStartMessage,
  ): Promise<Call | undefined> {
    if (!message.scopeType.isCommunityChannel()) {
      return undefined;
    }

    return this.repository.findActiveByCommunityChannel(
      message.getCommunityId(),
      message.getCommunityChannelId(),
    );
  }

  public async start(message: CallStartMessage): Promise<Call> {
    const resolvedScope = await this.scopeResolver.resolve(message);
    const activeCall = await this.findActiveCommunityChannelCall(message);

    if (activeCall) {
      activeCall.joinOrAdd(message.requesterIdentityId);
      await this.repository.save(activeCall);
      const lease = await this.leaseRenewer.renew(
        activeCall,
        message.requesterIdentityId,
      );
      await this.eventPublisher.publish([
        ...activeCall.pullDomainEvents(),
        ...lease.pullDomainEvents(),
      ]);

      return activeCall;
    }

    const participantIds = resolvedScope.scope.isConversation()
      ? [...resolvedScope.participantIds, ...message.invitedParticipantIds]
      : resolvedScope.participantIds;
    const call = Call.start(
      message.requesterIdentityId,
      resolvedScope.networkId,
      resolvedScope.scope,
      participantIds,
    );

    await this.repository.save(call);
    const lease = await this.leaseRenewer.renew(
      call,
      message.requesterIdentityId,
    );
    await this.eventPublisher.publish([
      ...call.pullDomainEvents(),
      ...lease.pullDomainEvents(),
    ]);

    return call;
  }
}
