import { CommunitySyncAvailableEvent } from '@app/contexts/communities/domain/events/CommunitySyncAvailableEvent';
import { CommunitySyncRequestedEvent } from '@app/contexts/communities/domain/events/CommunitySyncRequestedEvent';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { MongoCommunityChannelMessageRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RespondToCommunitySyncRequest extends Consumer {
  private static readonly MESSAGE_CANDIDATE_LIMIT = 100;
  public static QUEUE_NAME = 'pigeon-swarm.respond-to-community-sync-request';

  constructor(
    consumer: DomainEventConsumer,
    private readonly communityRepository: MongoCommunityRepository,
    private readonly messageRepository: MongoCommunityChannelMessageRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RespondToCommunitySyncRequest.QUEUE_NAME;
  }

  public get eventName(): string {
    return CommunitySyncRequestedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return CommunitySyncRequestedEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    const communityId = new CommunityId(
      String(event.attributes.communityId || event.aggregateId),
    );
    const [community, messages] = await Promise.all([
      this.communityRepository.findById(communityId),
      this.messageRepository.findByCommunity(
        communityId,
        RespondToCommunitySyncRequest.MESSAGE_CANDIDATE_LIMIT,
      ),
    ]);

    await this.eventPublisher.publish([
      new CommunitySyncAvailableEvent(event.aggregateId, {
        community: community?.toPrimitives(),
        communityId: event.aggregateId,
        messageCandidates: messages.map((message) => message.toPrimitives()),
        networkId: String(event.attributes.networkId),
        requestId: event.attributes.requestId
          ? String(event.attributes.requestId)
          : undefined,
      }),
    ]);
  }
}
