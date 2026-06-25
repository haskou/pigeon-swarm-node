import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';
import { assert } from '@haskou/value-objects';

import { CommunityChannelMessageReaction } from '../../domain/entities/messages/CommunityChannelMessageReaction';
import { CommunityChannelMessageNotFoundError } from '../../domain/errors/CommunityChannelMessageNotFoundError';
import { CommunityChannelMessageReactionWasAddedEvent } from '../../domain/events/CommunityChannelMessageReactionWasAddedEvent';
import CommunityChannelMessageRepository from '../../domain/repositories/CommunityChannelMessageRepository';
import CommunityMessageReactionRepository from '../../domain/repositories/CommunityMessageReactionRepository';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityChannelMessageReactionChangeMessage } from './messages/CommunityChannelMessageReactionChangeMessage';

export default class CommunityChannelMessageReactionAdder {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly messageRepository: CommunityChannelMessageRepository,
    private readonly reactionRepository: CommunityMessageReactionRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async add(
    message: CommunityChannelMessageReactionChangeMessage,
  ): Promise<CommunityChannelMessageReaction> {
    const community = await this.communityFinder.findById(message.communityId);

    assert(
      await this.messageRepository.findById(
        message.communityId,
        message.channelId,
        message.messageId,
      ),
      new CommunityChannelMessageNotFoundError(),
    );
    const reaction = community.reactWithSticker(
      message.actorIdentityId,
      message.channelId,
      message.messageId,
      message.emoji,
    );
    const communityPrimitives = community.toPrimitives();

    await this.reactionRepository.save(reaction);
    await this.eventPublisher.publish([
      new CommunityChannelMessageReactionWasAddedEvent(
        message.communityId.valueOf(),
        {
          ...reaction.toPrimitives(),
          community: communityPrimitives,
          memberIds: communityPrimitives.memberIds,
          networkId: communityPrimitives.networkId,
        },
      ),
    ]);

    return reaction;
  }
}
