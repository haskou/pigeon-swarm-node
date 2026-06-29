import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessageWasSentEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasSentEvent';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

import CommunityChannelMessageCandidateRegistrar from './CommunityChannelMessageCandidateRegistrar';
import { isCommunityChannelMessagePrimitive } from './isCommunityChannelMessagePrimitive';
import { isCommunityPrimitive } from './isCommunityPrimitive';

export default class RegisterCommunityMessageWhenAnnounced extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-community-channel-message-when-announced';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly communityRepository: CommunityRepository,

    private readonly messageRegistrar: CommunityChannelMessageCandidateRegistrar,
  ) {
    super(eventConsumer);
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
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
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
