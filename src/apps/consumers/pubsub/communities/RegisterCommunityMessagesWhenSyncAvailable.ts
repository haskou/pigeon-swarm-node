import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessage } from '@app/contexts/communities/domain/CommunityChannelMessage';
import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/CommunityChannelMessageReaction';
import { CommunitySyncAvailableEvent } from '@app/contexts/communities/domain/events/CommunitySyncAvailableEvent';
import { MongoCommunityMessageReactionRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageReactionRepository';
import { MongoCommunityChannelMessageRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

import { isCommunityChannelMessagePrimitive } from './isCommunityChannelMessagePrimitive';
import { isCommunityChannelMessageReactionPrimitive } from './isCommunityChannelMessageReactionPrimitive';
import { isCommunityPrimitive } from './isCommunityPrimitive';

type ReactionRepository = MongoCommunityMessageReactionRepository;

export default class RegisterCommunityMessagesWhenSync extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-community-messages-when-sync-available';

  constructor(
    consumer: DomainEventConsumer,
    private readonly communityRepository: MongoCommunityRepository,
    private readonly messageRepository: MongoCommunityChannelMessageRepository,
    private readonly reactionRepository: ReactionRepository,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RegisterCommunityMessagesWhenSync.QUEUE_NAME;
  }

  public get eventName(): string {
    return CommunitySyncAvailableEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return CommunitySyncAvailableEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    if (isCommunityPrimitive(event.attributes.community)) {
      await this.communityRepository.save(
        Community.fromPrimitives(event.attributes.community),
      );
    }

    const candidates = Array.isArray(event.attributes.messageCandidates)
      ? event.attributes.messageCandidates
      : [];

    for (const candidate of candidates) {
      if (!isCommunityChannelMessagePrimitive(candidate)) {
        continue;
      }

      await this.messageRepository.save(
        CommunityChannelMessage.fromPrimitives(candidate),
      );
    }

    const reactionCandidates = Array.isArray(
      event.attributes.reactionCandidates,
    )
      ? event.attributes.reactionCandidates
      : [];

    for (const candidate of reactionCandidates) {
      if (!isCommunityChannelMessageReactionPrimitive(candidate)) {
        continue;
      }

      await this.reactionRepository.save(
        CommunityChannelMessageReaction.fromPrimitives(candidate),
      );
    }
  }
}
