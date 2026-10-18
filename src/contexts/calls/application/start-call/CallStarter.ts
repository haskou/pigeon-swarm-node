import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Call } from '../../domain/Call';
import CallRepository from '../../domain/repositories/CallRepository';
import CallParticipantLeaseRenewer from '../renew-participant-lease/CallParticipantLeaseRenewer';
import CallScopeResolver from './CallScopeResolver';
import { CallStartResult } from './CallStartResult';
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
    onRecordAccepted?: () => Promise<void>,
  ): Promise<CallStartResult> {
    if (message.scopeType.isCommunityChannel()) {
      // One live call per channel: the caller signs a join instead of a start.
      const communityId = message.getCommunityId();
      const channelId = message.getCommunityChannelId();
      const hasActiveCall = await this.repository.hasActiveByCommunityChannel(
        communityId,
        channelId,
      );

      if (hasActiveCall) {
        const active = await this.repository.requireActiveByCommunityChannel(
          communityId,
          channelId,
        );

        return new CallStartResult(active, false);
      }
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

    await onRecordAccepted?.();
    await this.repository.saveStart(call, message.getProof());
    const lease = await this.leaseRenewer.renew(
      call,
      message.requesterIdentityId,
    );
    await this.eventPublisher.publish([
      ...call.pullDomainEvents(),
      ...lease.pullDomainEvents(),
    ]);

    return new CallStartResult(call, true);
  }

  /**
   * `onRecordAccepted` runs once the start is accepted, right before it is
   * stored; a rejection stores nothing. A refused or not yet answerable start,
   * or a live community call returned instead, never reaches it.
   */
  public async start(
    message: CallStartMessage,
    onRecordAccepted?: () => Promise<void>,
  ): Promise<CallStartResult> {
    const resolvedScope = await this.scopeResolver.resolve(message);

    if (!message.scopeType.isCommunityChannel()) {
      return this.startResolved(message, resolvedScope, onRecordAccepted);
    }

    return this.communityChannelStartCoordinator.coordinate(
      message.getCommunityId(),
      message.getCommunityChannelId(),
      () => this.startResolved(message, resolvedScope, onRecordAccepted),
    );
  }
}
