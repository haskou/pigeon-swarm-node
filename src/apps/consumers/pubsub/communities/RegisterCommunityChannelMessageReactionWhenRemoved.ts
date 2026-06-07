import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageReaction';
import { CommunityChannelMessageNotFoundError } from '@app/contexts/communities/domain/errors/CommunityChannelMessageNotFoundError';
import { CommunityChannelMessageReactionRemovedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageReactionWasRemovedEvent';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { MongoCommunityMessageReactionRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageReactionRepository';
import { MongoCommunityChannelMessageRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';
import { assert } from '@haskou/value-objects';

import { isCommunityChannelMessageReactionPrimitive } from './isCommunityChannelMessageReactionPrimitive';
import { isCommunityPrimitive } from './isCommunityPrimitive';

type ReactionRepository = MongoCommunityMessageReactionRepository;

export default class RegisterCommunityReactionWhenRemoved extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-community-channel-message-reaction-when-removed';

  constructor(
    consumer: DomainEventConsumer,
    private readonly communityRepository: MongoCommunityRepository,
    private readonly messageRepository: MongoCommunityChannelMessageRepository,
    private readonly reactionRepository: ReactionRepository,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RegisterCommunityReactionWhenRemoved.QUEUE_NAME;
  }

  public get eventName(): string {
    return CommunityChannelMessageReactionRemovedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return CommunityChannelMessageReactionRemovedEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    const communityAttributes = event.attributes.community;

    if (
      !isCommunityPrimitive(communityAttributes) ||
      !isCommunityChannelMessageReactionPrimitive(event.attributes)
    ) {
      return;
    }

    const community = Community.fromPrimitives(communityAttributes);
    const reaction = CommunityChannelMessageReaction.fromPrimitives(
      event.attributes,
    );
    const communityId = new CommunityId(event.attributes.communityId);
    const channelId = new CommunityChannelId(event.attributes.channelId);
    const messageId = new CommunityChannelMessageId(event.attributes.messageId);
    const authorIdentityId = new IdentityId(event.attributes.authorIdentityId);

    if (!community.getId().isEqual(communityId)) {
      return;
    }

    community.assertCanReactWithSticker(authorIdentityId, channelId);
    assert(
      await this.messageRepository.findById(communityId, channelId, messageId),
      new CommunityChannelMessageNotFoundError(),
    );

    await this.reactionRepository.delete(reaction);
    await this.communityRepository.save(community);
  }
}
