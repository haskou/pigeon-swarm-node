import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { Call } from '../../domain/Call';
import CallRepository from '../../domain/repositories/CallRepository';
import CallScopeResolver from './CallScopeResolver';
import { CallStartMessage } from './messages/CallStartMessage';

export default class CallStarter {
  constructor(
    private readonly repository: CallRepository,
    private readonly scopeResolver: CallScopeResolver,
    private readonly eventPublisher: DomainEventPublisher,
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
      await this.eventPublisher.publish(activeCall.pullDomainEvents());

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
    await this.eventPublisher.publish(call.pullDomainEvents());

    return call;
  }
}
