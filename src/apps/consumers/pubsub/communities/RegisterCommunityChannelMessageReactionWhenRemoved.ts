import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessageNotFoundError } from '@app/contexts/communities/domain/errors/CommunityChannelMessageNotFoundError';
import { CommunityChannelMessageReactionRemovedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageReactionWasRemovedEvent';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import CommunityMessageReactionRepository from '@app/contexts/communities/domain/repositories/CommunityMessageReactionRepository';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityChannelMessageReactionEmoji } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageReactionEmoji';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { assert, Timestamp } from '@haskou/value-objects';

import { isCommunityChannelMessageReactionPrimitive } from './isCommunityChannelMessageReactionPrimitive';
import { isCommunityPrimitive } from './isCommunityPrimitive';

export default class RegisterCommunityReactionWhenRemoved extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-community-channel-message-reaction-when-removed';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly communityRepository: CommunityRepository,
    private readonly messageRepository: CommunityChannelMessageRepository,
    private readonly reactionRepository: CommunityMessageReactionRepository,
  ) {
    super(eventConsumer);
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
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
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
    const communityId = new CommunityId(event.attributes.communityId);
    const channelId = new CommunityChannelId(event.attributes.channelId);
    const messageId = new CommunityChannelMessageId(event.attributes.messageId);
    const authorIdentityId = new IdentityId(event.attributes.authorIdentityId);

    if (!community.isIdentifiedBy(communityId)) {
      return;
    }

    assert(
      await this.messageRepository.findById(communityId, channelId, messageId),
      new CommunityChannelMessageNotFoundError(),
    );
    const reaction = community.reactWithSticker(
      authorIdentityId,
      channelId,
      messageId,
      new CommunityChannelMessageReactionEmoji(event.attributes.emoji),
      new Timestamp(event.attributes.createdAt),
    );

    await this.reactionRepository.delete(reaction);
    await this.communityRepository.save(community);
  }
}
