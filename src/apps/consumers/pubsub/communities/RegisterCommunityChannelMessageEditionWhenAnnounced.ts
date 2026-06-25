import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessageWasEditedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasEditedEvent';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';

import CommunityChannelMessageCandidateRegistrar from './CommunityChannelMessageCandidateRegistrar';
import { isCommunityChannelMessagePrimitive } from './isCommunityChannelMessagePrimitive';
import { isCommunityPrimitive } from './isCommunityPrimitive';

export default class RegisterCommunityMessageEdition extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-community-channel-message-edition-when-announced';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly communityRepository: CommunityRepository,

    private readonly messageRegistrar: CommunityChannelMessageCandidateRegistrar,
  ) {
    super(eventConsumer);
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
    if (
      !isCommunityPrimitive(event.attributes.community) ||
      !isCommunityChannelMessagePrimitive(event.attributes.message)
    ) {
      return;
    }

    const community = Community.fromPrimitives(event.attributes.community);
    const message = await this.messageRegistrar.registerEdition(
      community,
      event.attributes.message,
    );

    if (message) {
      await this.communityRepository.save(community);
    }
  }
}
