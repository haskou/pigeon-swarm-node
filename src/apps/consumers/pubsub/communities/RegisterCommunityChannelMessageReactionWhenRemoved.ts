import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageReaction';
import { CommunityChannelMessageReactionRemovedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageReactionWasRemovedEvent';
import { MongoCommunityMessageReactionRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageReactionRepository';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

import { isCommunityChannelMessageReactionPrimitive } from './isCommunityChannelMessageReactionPrimitive';

type ReactionRepository = MongoCommunityMessageReactionRepository;

export default class RegisterCommunityReactionWhenRemoved extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-community-channel-message-reaction-when-removed';

  constructor(
    consumer: DomainEventConsumer,
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
    if (!isCommunityChannelMessageReactionPrimitive(event.attributes)) {
      return;
    }

    await this.reactionRepository.delete(
      CommunityChannelMessageReaction.fromPrimitives(event.attributes),
    );
  }
}
