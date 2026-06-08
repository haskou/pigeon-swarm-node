import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageReaction';
import { CommunitySyncAvailableEvent } from '@app/contexts/communities/domain/events/CommunitySyncAvailableEvent';
import { MongoCommunityMessageReactionRepository as ReactionRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageReactionRepository';
import { MongoCommunityChannelMessageRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { CommunitySyncResponseMessage } from './messages/CommunitySyncResponseMessage';

export default class CommunitySyncResponder {
  private static readonly MESSAGE_CANDIDATE_LIMIT = 100;

  constructor(
    private readonly communityRepository: MongoCommunityRepository,
    private readonly messageRepository: MongoCommunityChannelMessageRepository,
    private readonly reactionRepository: ReactionRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly tracker = SyncResponseSuppressionTracker.shared(),
  ) {}

  private syncableReactions(
    reactions: CommunityChannelMessageReaction[],
    messages: CommunityChannelMessage[],
  ): CommunityChannelMessageReaction[] {
    return reactions.filter((reaction) =>
      messages.some((message) =>
        message.isIdentifiedBy(reaction.getMessageId()),
      ),
    );
  }

  public async respond(message: CommunitySyncResponseMessage): Promise<void> {
    const [community, messages, reactions] = await Promise.all([
      this.communityRepository.findById(message.communityId),
      this.messageRepository.findSyncableByCommunity(
        message.communityId,
        CommunitySyncResponder.MESSAGE_CANDIDATE_LIMIT,
      ),
      this.reactionRepository.findByCommunity(
        message.communityId,
        CommunitySyncResponder.MESSAGE_CANDIDATE_LIMIT,
      ),
    ]);

    if (!community || !community.belongsToNetwork(message.networkId)) {
      return;
    }

    const communityId = message.communityId.valueOf();
    const shouldRespond = await this.tracker.shouldRespond(
      'community',
      communityId,
      message.requestId,
    );

    if (!shouldRespond) {
      return;
    }

    const reactionCandidates = this.syncableReactions(reactions, messages);

    await this.eventPublisher.publish([
      new CommunitySyncAvailableEvent(communityId, {
        community: community.toPrimitives(),
        communityId,
        messageCandidates: messages.map((candidate) =>
          candidate.toPrimitives(),
        ),
        networkId: message.networkId.valueOf(),
        reactionCandidates: reactionCandidates.map((candidate) =>
          candidate.toPrimitives(),
        ),
        requestId: message.requestId,
      }),
    ]);
  }
}
