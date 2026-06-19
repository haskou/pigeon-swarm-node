import { CommunityNotFoundError } from '@app/contexts/communities/domain/errors/CommunityNotFoundError';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { InvalidPollScopeError } from '@app/contexts/polls/domain/errors/InvalidPollScopeError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Poll } from '../../domain/Poll';
import { PollScope } from '../../domain/PollScope';
import { CommunityChannelPollScopeResolveMessage } from './messages/CommunityChannelPollScopeResolveMessage';
import { GroupConversationPollScopeResolveMessage } from './messages/GroupConversationPollScopeResolveMessage';
import { PollScopeAccess } from './types/PollScopeAccess';

export default class PollScopeAccessResolver {
  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly conversationRepository: ConversationRepository,
  ) {}

  private async communityChannelScopeAccess(
    message: CommunityChannelPollScopeResolveMessage,
    action: 'create' | 'vote',
  ): Promise<PollScopeAccess> {
    const community = await this.communityRepository.findById(
      message.communityId,
    );

    if (!community) {
      throw new CommunityNotFoundError();
    }

    const visibleMembers =
      action === 'create'
        ? community.visibleMembersForTextChannelPollCreation(
            message.actorIdentityId,
            message.channelId,
          )
        : community.visibleMembersForTextChannelPollVote(
            message.actorIdentityId,
            message.channelId,
          );

    return {
      recipients: {
        memberIds: visibleMembers.map((member) => member.valueOf()),
      },
      scope: PollScope.communityChannel(
        community.getId(),
        message.channelId,
        community.getNetworkId(),
      ),
    };
  }

  private async resolvePollScope(
    actorIdentityId: IdentityId,
    poll: Poll,
    action: 'create' | 'vote',
  ): Promise<PollScopeAccess> {
    const scope = poll.getScope();
    const communityId = scope.getCommunityId();
    const channelId = scope.getChannelId();
    const conversationId = scope.getConversationId();

    if (scope.isCommunityChannel() && communityId && channelId) {
      const message = new CommunityChannelPollScopeResolveMessage(
        actorIdentityId.valueOf(),
        communityId.valueOf(),
        channelId.valueOf(),
      );

      return action === 'create'
        ? this.resolveCommunityChannelCreation(message)
        : this.resolveCommunityChannelVote(message);
    }

    if (conversationId) {
      return this.resolveGroupConversation(
        new GroupConversationPollScopeResolveMessage(
          actorIdentityId.valueOf(),
          conversationId.valueOf(),
        ),
      );
    }

    throw new InvalidPollScopeError();
  }

  public resolveCommunityChannelCreation(
    message: CommunityChannelPollScopeResolveMessage,
  ): Promise<PollScopeAccess> {
    return this.communityChannelScopeAccess(message, 'create');
  }

  public resolveCommunityChannelVote(
    message: CommunityChannelPollScopeResolveMessage,
  ): Promise<PollScopeAccess> {
    return this.communityChannelScopeAccess(message, 'vote');
  }

  public async resolveGroupConversation(
    message: GroupConversationPollScopeResolveMessage,
  ): Promise<PollScopeAccess> {
    const conversation = await this.conversationRepository.findById(
      message.conversationId,
    );

    if (!conversation) {
      throw new ConversationNotFoundError(message.conversationId);
    }

    if (
      !conversation.isGroup() ||
      !conversation.hasParticipant(message.actorIdentityId)
    ) {
      throw new InvalidPollScopeError();
    }

    return {
      recipients: {
        participantIds: conversation
          .getParticipantIds()
          .map((participantId) => participantId.valueOf()),
      },
      scope: PollScope.groupConversation(
        conversation.getId(),
        conversation.getNetworkId(),
      ),
    };
  }

  public resolvePollManagement(
    actorIdentityId: IdentityId,
    poll: Poll,
  ): Promise<PollScopeAccess> {
    return this.resolvePollScope(actorIdentityId, poll, 'create');
  }

  public resolvePollVote(
    actorIdentityId: IdentityId,
    poll: Poll,
  ): Promise<PollScopeAccess> {
    return this.resolvePollScope(actorIdentityId, poll, 'vote');
  }
}
