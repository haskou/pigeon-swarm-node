import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Call } from '../../domain/Call';
import CallRepository from '../../domain/repositories/CallRepository';
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

  private async startResolved(
    message: CallStartMessage,
    resolvedScope: ResolvedCallScope,
  ): Promise<Call> {
    if (message.scopeType.isCommunityChannel()) {
      // One live call per channel: the caller signs a join instead of a start.
      const activeCall = await this.repository.findActiveByCommunityChannel(
        message.getCommunityId(),
        message.getCommunityChannelId(),
      );

      if (activeCall) return activeCall;
    }

    const call = Call.start(
      message.requesterIdentityId,
      resolvedScope.networkId,
      resolvedScope.scope,
      resolvedScope.participantIds,
      message.nonce,
      message.startedAt,
      message.sessionEpoch,
    );

    await this.repository.saveStart(call, message.getProof());
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
