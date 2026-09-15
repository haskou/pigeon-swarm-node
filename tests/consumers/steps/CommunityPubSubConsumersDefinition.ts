import RegisterCommunityReactionWhenAdded from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageReactionWhenAdded';
import RegisterCommunityReactionWhenRemoved from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageReactionWhenRemoved';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageReaction';
import { CommunityChannelMessageReactionWasAddedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageReactionWasAddedEvent';
import { CommunityChannelMessageReactionRemovedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageReactionWasRemovedEvent';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import CommunityMessageReactionRepository from '@app/contexts/communities/domain/repositories/CommunityMessageReactionRepository';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { PrimitiveOf } from '@haskou/value-objects';
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

class FakeCommunityRepository {
  public saved: Community[] = [];

  constructor(private community: Community) {}

  public async findById(id: CommunityId): Promise<Community | undefined> {
    return this.community.isIdentifiedBy(id) ? this.community : undefined;
  }

  public async save(community: Community): Promise<void> {
    this.saved.push(community);
    this.community = community;
  }
}

class FakeCommunityMessageRepository {
  public async findById(): Promise<object> {
    return {};
  }
}

@binding()
export default class CommunityPubSubConsumersDefinition extends PubSubConsumerTestContext {
  private readonly channelId = 'community-channel-1';
  private readonly communityId = 'community-1';
  private readonly emoji = '👍';
  private readonly messageId = 'community-message-1';
  private readonly networkId = '550e8400-e29b-41d4-a716-446655440001';
  private readonly reactionCreatedAt = 1778513696020;

  private reactionRepository = new FakeCommunityReactionRepository();
  private communityRepository?: FakeCommunityRepository;
  private expectedCommunity?: PrimitiveOf<Community>;

  @before()
  public async reset(): Promise<void> {
    await this.resetConsumerTestContext();
    this.reactionRepository = new FakeCommunityReactionRepository();
    this.communityRepository = undefined;
    this.expectedCommunity = undefined;
  }

  private communityPrimitives(): PrimitiveOf<Community> {
    return {
      autoJoinEnabled: false,
      avatar: undefined,
      bannedMemberIds: [],
      banner: undefined,
      createdAt: 1778513696020,
      description: 'Community description',
      discoverable: true,
      id: this.communityId,
      memberIds: [this.ownerIdentityId()],
      memberRoles: [],
      name: 'Community',
      networkId: this.networkId,
      ownerIdentityId: this.ownerIdentityId(),
      roles: [
        {
          builtIn: true,
          id: 'everyone',
          name: 'everyone',
          permissions: [
            'attach_files',
            'connect_voice',
            'embed_links',
            'send_messages',
            'send_stickers',
            'view_channels',
          ],
        },
      ],
      textChannels: [
        {
          createdAt: 1778513696020,
          id: this.channelId,
          name: 'general',
          permissions: { visibleRoleIds: ['everyone'] },
          type: 'text',
        },
      ],
      visibility: 'private',
      voiceChannels: [],
    };
  }

  private canonicalCommunityRepository(): FakeCommunityRepository {
    const community = Community.fromPrimitives({
      ...this.communityPrimitives(),
      name: 'Updated community profile',
      description: 'A newer description than the event snapshot',
      discoverable: false,
    });
    this.expectedCommunity = community.toPrimitives();
    this.communityRepository = new FakeCommunityRepository(community);

    return this.communityRepository;
  }

  private assertCanonicalCommunityPreserved(): void {
    expect(this.communityRepository?.saved).to.have.length(1);
    expect(this.communityRepository?.saved[0].toPrimitives()).to.deep.equal(
      this.expectedCommunity,
    );
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
      this.canonicalCommunityRepository() as unknown as CommunityRepository,
      new FakeCommunityMessageRepository() as unknown as CommunityChannelMessageRepository,
      this.reactionRepository as unknown as CommunityMessageReactionRepository,
    );

    await consumer.handler(
      new CommunityChannelMessageReactionWasAddedEvent(this.communityId, {
        ...this.reactionAttributes(),
        community: this.communityPrimitives(),
      }),
    );
  }

  @when(
    'the community message reaction removed consumer handles a reaction announcement',
  )
  public async removedConsumerHandlesAReactionAnnouncement(): Promise<void> {
    const consumer = new RegisterCommunityReactionWhenRemoved(
      this.eventConsumer(),
      this.canonicalCommunityRepository() as unknown as CommunityRepository,
      new FakeCommunityMessageRepository() as unknown as CommunityChannelMessageRepository,
      this.reactionRepository as unknown as CommunityMessageReactionRepository,
    );

    await consumer.handler(
      new CommunityChannelMessageReactionRemovedEvent(this.communityId, {
        ...this.reactionAttributes(),
        community: this.communityPrimitives(),
      }),
    );
  }

  @then('the community message reaction repository should save that reaction')
  public repositoryShouldSaveThatReaction(): void {
    const reaction = this.reactionRepository.saved.at(-1);

    expect(reaction?.toPrimitives()).to.deep.equal(this.reactionAttributes());
    this.assertCanonicalCommunityPreserved();
  }

  @then('the community message reaction repository should delete that reaction')
  public repositoryShouldDeleteThatReaction(): void {
    const reaction = this.reactionRepository.deleted.at(-1);

    expect(reaction?.toPrimitives()).to.deep.equal(this.reactionAttributes());
    this.assertCanonicalCommunityPreserved();
  }
}
