import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { Community } from '@app/contexts/communities/domain/Community';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PollScope } from '../../../domain/PollScope';

/** What an identity may do in the scope of a poll, as of the replicated state. */
export default class PollMutationScopeAccess {
  private readonly communities = new ShortLivedLookup<Community | undefined>();

  private readonly conversations = new ShortLivedLookup<
    Conversation | undefined
  >();

  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly conversationRepository: ConversationRepository,
  ) {}

  /** Throws unless the identity may create or close polls in the scope. */
  public assertCanManage(scope: PollScope, identityId: string): Promise<void> {
    return this.assert(scope, identityId, 'manage');
  }

  /** Throws unless the identity may vote in the scope. */
  public assertCanVote(scope: PollScope, identityId: string): Promise<void> {
    return this.assert(scope, identityId, 'vote');
  }

  private assert(
    scope: PollScope,
    identityId: string,
    action: 'manage' | 'vote',
  ): Promise<void> {
    const actor = new IdentityId(identityId);

    return scope.match<Promise<void>>({
      communityChannel: async (communityId, channelId) => {
        const community = await this.communities.get(
          communityId.valueOf(),
          () => this.communityRepository.findById(communityId),
        );

        if (!community) throw new InvalidPublicMutationError();

        if (action === 'manage') {
          community.authorizeTextChannelPollCreation(actor, channelId);
        } else {
          community.authorizeTextChannelPollVote(actor, channelId);
        }
      },
      groupConversation: async (conversationId) => {
        const conversation = await this.conversations.get(
          conversationId.valueOf(),
          () => this.conversationRepository.findMetadataById(conversationId),
        );

        if (!conversation?.isGroup() || !conversation.hasParticipant(actor)) {
          throw new InvalidPublicMutationError();
        }
      },
    });
  }
}
