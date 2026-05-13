import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessageWasDeletedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasDeletedEvent';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { MongoCommunityChannelMessageRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

import { isCommunityPrimitive } from './isCommunityPrimitive';

export default class DeleteCommunityMessageWhenAnnounced extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.delete-community-channel-message-when-announced';

  constructor(
    consumer: DomainEventConsumer,
    private readonly communityRepository: MongoCommunityRepository,
    private readonly messageRepository: MongoCommunityChannelMessageRepository,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return DeleteCommunityMessageWhenAnnounced.QUEUE_NAME;
  }

  public get eventName(): string {
    return CommunityChannelMessageWasDeletedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return CommunityChannelMessageWasDeletedEvent;
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

    await this.messageRepository.delete(
      new CommunityId(
        String(event.attributes.communityId || event.aggregateId),
      ),
      new CommunityChannelId(String(event.attributes.channelId)),
      new CommunityChannelMessageId(String(event.attributes.targetMessageId)),
    );
  }
}
