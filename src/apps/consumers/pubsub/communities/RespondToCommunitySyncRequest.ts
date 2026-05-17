import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessage } from '@app/contexts/communities/domain/CommunityChannelMessage';
import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/CommunityChannelMessageReaction';
import { CommunitySyncAvailableEvent } from '@app/contexts/communities/domain/events/CommunitySyncAvailableEvent';
import { CommunitySyncRequestedEvent } from '@app/contexts/communities/domain/events/CommunitySyncRequestedEvent';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { MongoCommunityMessageReactionRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageReactionRepository';
import { MongoCommunityChannelMessageRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

type ReactionRepository = MongoCommunityMessageReactionRepository;
type CommunitySyncData = {
  community: Community | undefined;
  messages: CommunityChannelMessage[];
  reactions: CommunityChannelMessageReaction[];
};

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

  private requestIdFrom(event: DomainEvent): string | undefined {
    return event.attributes.requestId
      ? String(event.attributes.requestId)
      : undefined;
  }

  private async findSyncData(
    communityId: CommunityId,
  ): Promise<CommunitySyncData> {
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

    return { community, messages, reactions };
  }

  private hasNoLocalData(syncData: CommunitySyncData): boolean {
    return (
      !syncData.community &&
      syncData.messages.length === 0 &&
      syncData.reactions.length === 0
    );
  }

  private belongsToRequestedNetwork(
    syncData: CommunitySyncData,
    networkId: NetworkId,
  ): boolean {
    if (!syncData.community) {
      return true;
    }

    return syncData.community.belongsToNetwork(networkId);
  }

  public async handler(event: DomainEvent): Promise<void> {
    const communityId = new CommunityId(
      String(event.attributes.communityId || event.aggregateId),
    );
    const networkId = new NetworkId(String(event.attributes.networkId));
    const requestId = this.requestIdFrom(event);
    const syncData = await this.findSyncData(communityId);

    if (
      this.hasNoLocalData(syncData) ||
      !this.belongsToRequestedNetwork(syncData, networkId)
    ) {
      return;
    }

    const shouldRespond = await this.tracker.shouldRespond(
      'community',
      communityId.valueOf(),
      requestId,
    );

    if (!shouldRespond) {
      return;
    }

    await this.eventPublisher.publish([
      new CommunitySyncAvailableEvent(event.aggregateId, {
        community: syncData.community?.toPrimitives(),
        communityId: event.aggregateId,
        messageCandidates: syncData.messages.map((message) =>
          message.toPrimitives(),
        ),
        networkId: networkId.valueOf(),
        reactionCandidates: syncData.reactions.map((reaction) =>
          reaction.toPrimitives(),
        ),
        requestId,
      }),
    ]);
  }
}
