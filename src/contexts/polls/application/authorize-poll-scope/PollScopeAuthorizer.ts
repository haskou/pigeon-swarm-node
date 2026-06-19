import { CommunityNotFoundError } from '@app/contexts/communities/domain/errors/CommunityNotFoundError';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { InvalidPollScopeError } from '@app/contexts/polls/domain/errors/InvalidPollScopeError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Poll } from '../../domain/Poll';
import { PollAudience } from '../../domain/PollAudience';
import { PollScope } from '../../domain/PollScope';
import { CommunityChannelPollScopeAuthorizeMessage } from './messages/CommunityChannelPollScopeAuthorizeMessage';
import { GroupConversationPollScopeAuthorizeMessage } from './messages/GroupConversationPollScopeAuthorizeMessage';
import { PollScopeResolution } from './PollScopeResolution';

export default class PollScopeAuthorizer {
  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly conversationRepository: ConversationRepository,
  ) {}

  private async authorizeCommunityChannel(
    message: CommunityChannelPollScopeAuthorizeMessage,
    action: 'create' | 'vote',
  ): Promise<PollScopeResolution> {
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

    return new PollScopeResolution(
      PollAudience.communityMembers(visibleMembers),
      PollScope.communityChannel(
        community.getId(),
        message.channelId,
        community.getNetworkId(),
      ),
    );
  }

  private async authorizePollScope(
    actorIdentityId: IdentityId,
    poll: Poll,
    action: 'create' | 'vote',
  ): Promise<PollScopeResolution> {
    const scope = poll.getScope();
    const communityId = scope.getCommunityId();
    const channelId = scope.getChannelId();
    const conversationId = scope.getConversationId();

    if (scope.isCommunityChannel() && communityId && channelId) {
      const message = new CommunityChannelPollScopeAuthorizeMessage(
        actorIdentityId.valueOf(),
        communityId.valueOf(),
        channelId.valueOf(),
      );

      return action === 'create'
        ? this.authorizeCommunityChannelCreation(message)
        : this.authorizeCommunityChannelVote(message);
    }

    if (conversationId) {
      return this.authorizeGroupConversation(
        new GroupConversationPollScopeAuthorizeMessage(
          actorIdentityId.valueOf(),
          conversationId.valueOf(),
        ),
      );
    }

    throw new InvalidPollScopeError();
  }

  public authorizeCommunityChannelCreation(
    message: CommunityChannelPollScopeAuthorizeMessage,
  ): Promise<PollScopeResolution> {
    return this.authorizeCommunityChannel(message, 'create');
  }

  public authorizeCommunityChannelVote(
    message: CommunityChannelPollScopeAuthorizeMessage,
  ): Promise<PollScopeResolution> {
    return this.authorizeCommunityChannel(message, 'vote');
  }

  public async authorizeGroupConversation(
    message: GroupConversationPollScopeAuthorizeMessage,
  ): Promise<PollScopeResolution> {
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

    return new PollScopeResolution(
      PollAudience.conversationParticipants(conversation.getParticipantIds()),
      PollScope.groupConversation(
        conversation.getId(),
        conversation.getNetworkId(),
      ),
    );
  }

  public authorizePollManagement(
    actorIdentityId: IdentityId,
    poll: Poll,
  ): Promise<PollScopeResolution> {
    return this.authorizePollScope(actorIdentityId, poll, 'create');
  }

  public authorizePollVote(
    actorIdentityId: IdentityId,
    poll: Poll,
  ): Promise<PollScopeResolution> {
    return this.authorizePollScope(actorIdentityId, poll, 'vote');
  }
}
