import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/CommunityChannelMessageReaction';
import { CommunityChannelMessageReactionWasAddedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageReactionWasAddedEvent';
import { MongoCommunityMessageReactionRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageReactionRepository';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

import { isCommunityChannelMessageReactionPrimitive } from './isCommunityChannelMessageReactionPrimitive';

type ReactionRepository = MongoCommunityMessageReactionRepository;

export default class RegisterCommunityReactionWhenAdded extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-community-channel-message-reaction-when-added';

  constructor(
    consumer: DomainEventConsumer,
    private readonly reactionRepository: ReactionRepository,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RegisterCommunityReactionWhenAdded.QUEUE_NAME;
  }

  public get eventName(): string {
    return CommunityChannelMessageReactionWasAddedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return CommunityChannelMessageReactionWasAddedEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    if (!isCommunityChannelMessageReactionPrimitive(event.attributes)) {
      return;
    }

    await this.reactionRepository.save(
      CommunityChannelMessageReaction.fromPrimitives(event.attributes),
    );
  }
}
