import { Community } from '@app/contexts/communities/domain/Community';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationFrontier } from '@app/contexts/public-mutations/domain/PublicMutationFrontier';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PollScope } from '../../../domain/PollScope';

/** What an identity may do in the scope of a poll, as of the scope frontier the record carries. */
export default class PollMutationScopeAccess {
  private readonly communities = new ShortLivedLookup<Community | undefined>();

  private readonly conversations = new ShortLivedLookup<
    Conversation | undefined
  >();

  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly conversationRepository: ConversationRepository,
  ) {}

  private assert(
    scope: PollScope,
    frontier: string[],
    identityId: string,
    action: 'manage' | 'vote',
  ): Promise<void> {
    const actor = new IdentityId(identityId);

    return scope.match<Promise<void>>({
      communityChannel: async (communityId, channelId) => {
        const community = await this.communities.get(
          PublicMutationFrontier.keyOf(communityId.valueOf(), frontier),
          () => this.communityRepository.findAtFrontier(communityId, frontier),
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
          PublicMutationFrontier.keyOf(conversationId.valueOf(), frontier),
          () =>
            this.conversationRepository.findMetadataAtFrontier(
              conversationId,
              frontier,
            ),
        );

        if (!conversation?.isGroup() || !conversation.hasParticipant(actor)) {
          throw new InvalidPublicMutationError();
        }
      },
    });
  }

  /** Throws unless the identity may create or close polls in the scope. */
  public assertCanManage(
    scope: PollScope,
    frontier: string[],
    identityId: string,
  ): Promise<void> {
    return this.assert(scope, frontier, identityId, 'manage');
  }

  /** Throws unless the identity may vote in the scope. */
  public assertCanVote(
    scope: PollScope,
    frontier: string[],
    identityId: string,
  ): Promise<void> {
    return this.assert(scope, frontier, identityId, 'vote');
  }
}
