import RegisterCommunityReactionWhenAdded from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageReactionWhenAdded';
import RegisterCommunityReactionWhenRemoved from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageReactionWhenRemoved';
import RegisterCommunityMessagesWhenSync from '@app/apps/consumers/pubsub/communities/RegisterCommunityMessagesWhenSyncAvailable';
import RespondToCommunitySyncRequest from '@app/apps/consumers/pubsub/communities/RespondToCommunitySyncRequest';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/CommunityChannelMessageReaction';
import { CommunityChannelMessageReactionWasAddedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageReactionWasAddedEvent';
import { CommunityChannelMessageReactionRemovedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageReactionWasRemovedEvent';
import { CommunitySyncAvailableEvent } from '@app/contexts/communities/domain/events/CommunitySyncAvailableEvent';
import { CommunitySyncRequestedEvent } from '@app/contexts/communities/domain/events/CommunitySyncRequestedEvent';
import { MongoCommunityChannelMessageRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import { MongoCommunityMessageReactionRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageReactionRepository';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { expect } from 'chai';
import { before, binding, then, when } from 'cucumber-tsflow';

import { PubSubConsumerTestContext } from './PubSubConsumerTestHelpers';

class FakeCommunityReactionRepository {
  public deleted: CommunityChannelMessageReaction[] = [];
  public saved: CommunityChannelMessageReaction[] = [];

  public async save(reaction: CommunityChannelMessageReaction): Promise<void> {
    this.saved.push(reaction);
  }

  public async delete(
    reaction: CommunityChannelMessageReaction,
  ): Promise<void> {
    this.deleted.push(reaction);
  }
}

class FakeEventPublisher implements DomainEventPublisher {
  public publishedEvents: DomainEvent[][] = [];

  public async publish(events: DomainEvent[]): Promise<void> {
    this.publishedEvents.push(events);
  }
}

@binding()
export default class CommunityPubSubConsumersDefinition extends PubSubConsumerTestContext {
  private readonly channelId = 'community-channel-1';
  private readonly communityId = 'community-1';
  private readonly emoji = '👍';
  private readonly messageId = 'community-message-1';
  private readonly networkId = '550e8400-e29b-41d4-a716-446655440001';
  private readonly otherNetworkId = '550e8400-e29b-41d4-a716-446655440002';
  private readonly reactionCreatedAt = 1778513696020;

  private eventPublisher = new FakeEventPublisher();
  private reactionRepository = new FakeCommunityReactionRepository();

  @before()
  public async reset(): Promise<void> {
    await this.resetConsumerTestContext();
    this.eventPublisher = new FakeEventPublisher();
    this.reactionRepository = new FakeCommunityReactionRepository();
  }

  private reactionAttributes() {
    return {
      authorIdentityId: this.ownerIdentityId(),
      channelId: this.channelId,
      communityId: this.communityId,
      createdAt: this.reactionCreatedAt,
      emoji: this.emoji,
      messageId: this.messageId,
    };
  }

  @when(
    'the community message reaction added consumer handles a reaction announcement',
  )
  public async addedConsumerHandlesAReactionAnnouncement(): Promise<void> {
    const consumer = new RegisterCommunityReactionWhenAdded(
      this.eventConsumer(),
      this.reactionRepository as unknown as MongoCommunityMessageReactionRepository,
    );

    await consumer.handler(
      new CommunityChannelMessageReactionWasAddedEvent(
        this.communityId,
        this.reactionAttributes(),
      ),
    );
  }

  @when(
    'the community message reaction removed consumer handles a reaction announcement',
  )
  public async removedConsumerHandlesAReactionAnnouncement(): Promise<void> {
    const consumer = new RegisterCommunityReactionWhenRemoved(
      this.eventConsumer(),
      this.reactionRepository as unknown as MongoCommunityMessageReactionRepository,
    );

    await consumer.handler(
      new CommunityChannelMessageReactionRemovedEvent(
        this.communityId,
        this.reactionAttributes(),
      ),
    );
  }

  @when(
    'the community sync available consumer handles a reaction sync response',
  )
  public async syncAvailableConsumerHandlesAReactionSyncResponse(): Promise<void> {
    const consumer = new RegisterCommunityMessagesWhenSync(
      this.eventConsumer(),
      {
        save: async (): Promise<void> => undefined,
      } as unknown as MongoCommunityRepository,
      {
        save: async (): Promise<void> => undefined,
      } as unknown as MongoCommunityChannelMessageRepository,
      this.reactionRepository as unknown as MongoCommunityMessageReactionRepository,
    );

    await consumer.handler(
      new CommunitySyncAvailableEvent(this.communityId, {
        communityId: this.communityId,
        reactionCandidates: [this.reactionAttributes(), { messageId: 123 }],
      }),
    );
  }

  @when(
    'the community sync request consumer handles a request without local data',
  )
  public async syncRequestConsumerHandlesARequestWithoutLocalData(): Promise<void> {
    const consumer = new RespondToCommunitySyncRequest(
      this.eventConsumer(),
      {
        findById: async (): Promise<undefined> => undefined,
      } as unknown as MongoCommunityRepository,
      {
        findByCommunity: async (): Promise<[]> => [],
      } as unknown as MongoCommunityChannelMessageRepository,
      {
        findByCommunity: async (): Promise<[]> => [],
      } as unknown as MongoCommunityMessageReactionRepository,
      this.eventPublisher,
    );

    await consumer.handler(
      new CommunitySyncRequestedEvent(this.communityId, {
        communityId: this.communityId,
        networkId: this.networkId,
        requestId: this.requestId,
      }),
    );
  }

  @when(
    'the community sync request consumer handles a request for a community in another network',
  )
  public async syncRequestConsumerHandlesARequestForAnotherNetwork(): Promise<void> {
    const consumer = new RespondToCommunitySyncRequest(
      this.eventConsumer(),
      {
        findById: async (): Promise<Community> =>
          Community.fromPrimitives({
            avatar: undefined,
            banner: undefined,
            createdAt: 1778513696020,
            description: 'Community description',
            id: this.communityId,
            memberIds: [this.ownerIdentityId()],
            name: 'Community',
            networkId: this.otherNetworkId,
            ownerIdentityId: this.ownerIdentityId(),
            textChannels: [],
            visibility: 'private',
            voiceChannels: [],
          }),
      } as unknown as MongoCommunityRepository,
      {
        findByCommunity: async (): Promise<[]> => [],
      } as unknown as MongoCommunityChannelMessageRepository,
      {
        findByCommunity: async (): Promise<[]> => [],
      } as unknown as MongoCommunityMessageReactionRepository,
      this.eventPublisher,
    );

    await consumer.handler(
      new CommunitySyncRequestedEvent(this.communityId, {
        communityId: this.communityId,
        networkId: this.networkId,
        requestId: this.requestId,
      }),
    );
  }

  @then('the community message reaction repository should save that reaction')
  public repositoryShouldSaveThatReaction(): void {
    const reaction = this.reactionRepository.saved.at(-1);

    expect(reaction?.toPrimitives()).to.deep.equal(this.reactionAttributes());
  }

  @then('the community message reaction repository should delete that reaction')
  public repositoryShouldDeleteThatReaction(): void {
    const reaction = this.reactionRepository.deleted.at(-1);

    expect(reaction?.toPrimitives()).to.deep.equal(this.reactionAttributes());
  }

  @then('no community sync response should be published')
  public noCommunitySyncResponseShouldBePublished(): void {
    expect(this.eventPublisher.publishedEvents).to.deep.equal([]);
  }
}
