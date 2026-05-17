import { CommunitySyncAvailableEvent } from '@app/contexts/communities/domain/events/CommunitySyncAvailableEvent';
import { CommunitySyncRequestedEvent } from '@app/contexts/communities/domain/events/CommunitySyncRequestedEvent';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { MongoCommunityMessageReactionRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageReactionRepository';
import { MongoCommunityChannelMessageRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

type ReactionRepository = MongoCommunityMessageReactionRepository;

export default class RespondToCommunitySyncRequest extends Consumer {
  private static readonly MESSAGE_CANDIDATE_LIMIT = 100;
  public static QUEUE_NAME = 'pigeon-swarm.respond-to-community-sync-request';

  constructor(
    consumer: DomainEventConsumer,
    private readonly communityRepository: MongoCommunityRepository,
    private readonly messageRepository: MongoCommunityChannelMessageRepository,
    private readonly reactionRepository: ReactionRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly tracker = SyncResponseSuppressionTracker.shared(),
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
    const requestId = event.attributes.requestId
      ? String(event.attributes.requestId)
      : undefined;
    const shouldRespond = await this.tracker.shouldRespond(
      'community',
      communityId.valueOf(),
      requestId,
    );

    if (!shouldRespond) {
      return;
    }

    const [community, messages, reactions] = await Promise.all([
      this.communityRepository.findById(communityId),
      this.messageRepository.findByCommunity(
        communityId,
        RespondToCommunitySyncRequest.MESSAGE_CANDIDATE_LIMIT,
      ),
      this.reactionRepository.findByCommunity(
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
        reactionCandidates: reactions.map((reaction) =>
          reaction.toPrimitives(),
        ),
        requestId,
      }),
    ]);
  }
}
