import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { CommunityNotFoundError } from '@app/contexts/communities/domain/errors/CommunityNotFoundError';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { MongoCommunityChannelMessageRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import { ConversationRepository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import OrbitDBConversationRepository from '@app/contexts/conversations/infrastructure/orbitdb/OrbitDBConversationRepository';
import { InvalidPollScopeError } from '@app/contexts/polls/domain/errors/InvalidPollScopeError';
import { PollNotFoundError } from '@app/contexts/polls/domain/errors/PollNotFoundError';
import { Poll } from '@app/contexts/polls/domain/Poll';
import { PollScope } from '@app/contexts/polls/domain/PollScope';
import { PollId } from '@app/contexts/polls/domain/value-objects/PollId';
import { MongoPollRepository } from '@app/contexts/polls/infrastructure/mongo/MongoPollRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request } from 'express';

import { CommunityMessageRepository } from './types/CommunityMessageRepository';
import { PollScopeAccess } from './types/PollScopeAccess';

export abstract class PollRouteSupport extends Route {
  protected readonly eventPublisher: DomainEventPublisher =
    this.get<MessageBus>(MessageBus);

  protected readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  protected async authenticate(request: Request): Promise<IdentityId> {
    return this.signedRequestAuthenticator.authenticate(request);
  }

  protected repository(): MongoPollRepository {
    return new MongoPollRepository(this.get<MongoDB>(MongoDB));
  }

  protected communityRepository(): MongoCommunityRepository {
    return new MongoCommunityRepository(this.get<MongoDB>(MongoDB));
  }

  protected communityMessageRepository(): CommunityMessageRepository {
    return new MongoCommunityChannelMessageRepository(
      this.get<MongoDB>(MongoDB),
    );
  }

  protected conversationRepository(): ConversationRepository {
    return new OrbitDBConversationRepository();
  }

  protected async findPoll(id: string): Promise<Poll> {
    const poll = await this.repository().findById(new PollId(id));

    if (!poll) {
      throw new PollNotFoundError();
    }

    return poll;
  }

  protected async communityChannelScope(
    actor: IdentityId,
    communityId: string,
    channelId: string,
  ): Promise<PollScopeAccess> {
    return this.communityChannelScopeAccess(
      actor,
      communityId,
      channelId,
      'create',
    );
  }

  protected async communityChannelVoteScope(
    actor: IdentityId,
    communityId: string,
    channelId: string,
  ): Promise<PollScopeAccess> {
    return this.communityChannelScopeAccess(
      actor,
      communityId,
      channelId,
      'vote',
    );
  }

  private async communityChannelScopeAccess(
    actor: IdentityId,
    communityId: string,
    channelId: string,
    action: 'create' | 'vote',
  ): Promise<PollScopeAccess> {
    const community = await this.communityRepository().findById(
      new CommunityId(communityId),
    );

    if (!community) {
      throw new CommunityNotFoundError();
    }

    const channel = new CommunityChannelId(channelId);

    if (action === 'create') {
      community.assertCanCreatePoll(actor, channel);
    } else {
      community.assertCanVotePoll(actor, channel);
    }

    return {
      recipients: {
        memberIds: community
          .visibleMembersForTextChannel(channel)
          .map((member) => member.valueOf()),
      },
      scope: PollScope.communityChannel(
        community.getId(),
        channel,
        community.getNetworkId(),
      ),
    };
  }

  protected async groupConversationScope(
    actor: IdentityId,
    conversationId: string,
  ): Promise<PollScopeAccess> {
    const conversation = await this.conversationRepository().findById(
      new ConversationId(conversationId),
    );

    if (!conversation) {
      throw new ConversationNotFoundError(new ConversationId(conversationId));
    }

    if (!conversation.isGroup() || !conversation.hasParticipant(actor)) {
      throw new InvalidPollScopeError();
    }

    return {
      recipients: {
        participantIds: conversation.toPrimitives().participantIds,
      },
      scope: PollScope.groupConversation(
        conversation.getId(),
        conversation.getNetworkId(),
      ),
    };
  }

  protected async accessPollScope(
    actor: IdentityId,
    poll: Poll,
  ): Promise<PollScopeAccess> {
    const scope = poll.getScope();
    const communityId = scope.getCommunityId();
    const channelId = scope.getChannelId();
    const conversationId = scope.getConversationId();

    if (scope.isCommunityChannel() && communityId && channelId) {
      return this.communityChannelVoteScope(
        actor,
        communityId.valueOf(),
        channelId.valueOf(),
      );
    }

    if (conversationId) {
      return this.groupConversationScope(actor, conversationId.valueOf());
    }

    throw new InvalidPollScopeError();
  }

  protected async managePollScope(
    actor: IdentityId,
    poll: Poll,
  ): Promise<PollScopeAccess> {
    const scope = poll.getScope();
    const communityId = scope.getCommunityId();
    const channelId = scope.getChannelId();
    const conversationId = scope.getConversationId();

    if (scope.isCommunityChannel() && communityId && channelId) {
      return this.communityChannelScope(
        actor,
        communityId.valueOf(),
        channelId.valueOf(),
      );
    }

    if (conversationId) {
      return this.groupConversationScope(actor, conversationId.valueOf());
    }

    throw new InvalidPollScopeError();
  }
}
