import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageWasEditedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasEditedEvent';
import { MongoCommunityChannelMessageRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

import { isCommunityChannelMessagePrimitive } from './isCommunityChannelMessagePrimitive';
import { isCommunityPrimitive } from './isCommunityPrimitive';

export default class RegisterCommunityMessageEdition extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-community-channel-message-edition-when-announced';

  constructor(
    consumer: DomainEventConsumer,
    private readonly communityRepository: MongoCommunityRepository,
    private readonly messageRepository: MongoCommunityChannelMessageRepository,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RegisterCommunityMessageEdition.QUEUE_NAME;
  }

  public get eventName(): string {
    return CommunityChannelMessageWasEditedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return CommunityChannelMessageWasEditedEvent;
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

    if (!isCommunityChannelMessagePrimitive(event.attributes.message)) {
      return;
    }

    await this.messageRepository.save(
      CommunityChannelMessage.fromPrimitives(event.attributes.message),
    );
  }
}
