import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessageWasSentEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasSentEvent';
import { MongoCommunityChannelMessageRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

import { CommunityChannelMessageCandidateRegistrar } from './CommunityChannelMessageCandidateRegistrar';
import { isCommunityChannelMessagePrimitive } from './isCommunityChannelMessagePrimitive';
import { isCommunityPrimitive } from './isCommunityPrimitive';

export default class RegisterCommunityMessageWhenAnnounced extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-community-channel-message-when-announced';

  constructor(
    consumer: DomainEventConsumer,
    private readonly communityRepository: MongoCommunityRepository,
    private readonly messageRepository: MongoCommunityChannelMessageRepository,
  ) {
    super(consumer);
  }

  private get messageRegistrar(): CommunityChannelMessageCandidateRegistrar {
    return new CommunityChannelMessageCandidateRegistrar(
      this.messageRepository,
    );
  }

  public get queueName(): string {
    return RegisterCommunityMessageWhenAnnounced.QUEUE_NAME;
  }

  public get eventName(): string {
    return CommunityChannelMessageWasSentEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return CommunityChannelMessageWasSentEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    if (
      !isCommunityPrimitive(event.attributes.community) ||
      !isCommunityChannelMessagePrimitive(event.attributes.message)
    ) {
      return;
    }

    const community = Community.fromPrimitives(event.attributes.community);
    const message = await this.messageRegistrar.registerSent(
      community,
      event.attributes.message,
    );

    if (message) {
      await this.communityRepository.save(community);
    }
  }
}
