import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Call } from '../../domain/Call';
import CallRepository from '../../domain/repositories/CallRepository';
import { CallSessionEpoch } from '../../domain/value-objects/CallSessionEpoch';
import CallParticipantLeaseRenewer from '../renew-participant-lease/CallParticipantLeaseRenewer';
import CallScopeResolver from './CallScopeResolver';
import CommunityChannelCallStartCoordinator from './CommunityChannelCallStartCoordinator';
import { CallStartMessage } from './messages/CallStartMessage';
import { ResolvedCallScope } from './ResolvedCallScope';

export default class CallStarter {
  constructor(
    private readonly repository: CallRepository,
    private readonly scopeResolver: CallScopeResolver,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly leaseRenewer: CallParticipantLeaseRenewer,
    private readonly communityChannelStartCoordinator: CommunityChannelCallStartCoordinator,
  ) {}

  private nextSessionEpoch(previousCalls: Call[]): CallSessionEpoch {
    const latest = previousCalls.reduce(
      (epoch, call) => Math.max(epoch, call.getSessionEpoch()?.valueOf() ?? 0),
      0,
    );

    return new CallSessionEpoch(latest + 1);
  }

  private async startResolved(
    message: CallStartMessage,
    resolvedScope: ResolvedCallScope,
  ): Promise<Call> {
    const previousCalls = message.scopeType.isCommunityChannel()
      ? await this.repository.findByCommunityChannel(
          message.getCommunityId(),
          message.getCommunityChannelId(),
        )
      : [];
    const activeCall = previousCalls
      .filter((call) => call.isActive())
      .sort((left, right) =>
        left.getId().valueOf().localeCompare(right.getId().valueOf()),
      )[0];

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
      message.scopeType.isCommunityChannel()
        ? this.nextSessionEpoch(previousCalls)
        : undefined,
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

  public async start(message: CallStartMessage): Promise<Call> {
    const resolvedScope = await this.scopeResolver.resolve(message);

    if (!message.scopeType.isCommunityChannel()) {
      return this.startResolved(message, resolvedScope);
    }

    return this.communityChannelStartCoordinator.coordinate(
      message.getCommunityId(),
      message.getCommunityChannelId(),
      () => this.startResolved(message, resolvedScope),
    );
  }
}
